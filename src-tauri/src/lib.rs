use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{ReadFile, WriteFile};
const PIPE_ACCESS_DUPLEX: u32 = 0x00000003;
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe,
    PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT,
};
use tauri::State;
use url::Url;

#[derive(Debug, Serialize, Deserialize)]
pub struct RedactionResult {
    pub redacted: String,
    pub count: usize,
}

struct AppState {
    session_keys: Mutex<HashMap<String, String>>,
    pending_context: Arc<Mutex<Option<Value>>>,
    latest_bridge_result: Arc<Mutex<Option<Value>>>,
}

#[derive(Debug, Serialize)]
struct ProviderTestResult {
    ok: bool,
    message: String,
    model_count: Option<usize>,
}

fn credential_entry(provider_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("CodeLens", &format!("provider:{provider_id}"))
        .map_err(|e| format!("Windows Credential Manager error: {e}"))
}

fn validate_endpoint(endpoint: &str, kind: &str, network_lock: bool) -> Result<Url, String> {
    if kind != "local" && kind != "cloud" {
        return Err("Unsupported provider type. Choose Local AI or Cloud AI.".into());
    }

    let url = Url::parse(endpoint.trim()).map_err(|_| "Invalid provider endpoint URL".to_string())?;
    if url.username() != "" || url.password().is_some() {
        return Err("Provider URLs containing embedded credentials are not allowed.".into());
    }

    let host = url.host_str().unwrap_or("");
    let is_local = matches!(host, "localhost" | "127.0.0.1" | "::1");

    if network_lock && !is_local {
        return Err("Network Lock blocks non-local AI endpoints.".into());
    }

    if !is_local && url.scheme() != "https" {
        return Err("Non-local AI endpoints must use HTTPS.".into());
    }

    if kind == "local" && !is_local {
        return Err("A provider marked Local AI must use localhost, 127.0.0.1, or ::1.".into());
    }

    Ok(url)
}

fn get_api_key(state: &State<'_, AppState>, provider_id: &str) -> Option<String> {
    if let Ok(map) = state.session_keys.lock() {
        if let Some(key) = map.get(provider_id) {
            return Some(key.clone());
        }
    }

    credential_entry(provider_id)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}

fn start_vscode_bridge(pending_context: Arc<Mutex<Option<Value>>>, latest_bridge_result: Arc<Mutex<Option<Value>>>) {
    thread::spawn(move || unsafe {
        let name: Vec<u16> = "\\\\.\\pipe\\CodeLens\0".encode_utf16().collect();
        loop {
            let pipe = CreateNamedPipeW(
                name.as_ptr(),
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                1,
                64 * 1024,
                64 * 1024,
                0,
                std::ptr::null(),
            );
            if pipe == INVALID_HANDLE_VALUE { thread::sleep(Duration::from_secs(2)); continue; }
            let connected = ConnectNamedPipe(pipe, std::ptr::null_mut());
            if connected == 0 { CloseHandle(pipe); continue; }
            let mut buf = vec![0u8; 256 * 1024];
            let mut read = 0u32;
            let ok = ReadFile(pipe, buf.as_mut_ptr() as *mut _, buf.len() as u32, &mut read, std::ptr::null_mut());
            if ok != 0 && read > 0 {
                let mut response_bytes = b"OK\n".to_vec();
                if let Ok(text) = String::from_utf8(buf[..read as usize].to_vec()) {
                    if let Some(line) = text.lines().next() {
                        if let Ok(value) = serde_json::from_str::<Value>(line) {
                            match value.get("type").and_then(Value::as_str) {
                                Some("context") => {
                                    if let Ok(mut pending) = pending_context.lock() { *pending = Some(value); }
                                }
                                Some("result") => {
                                    let request_id = value.get("requestId").cloned().unwrap_or(Value::Null);
                                    let result = latest_bridge_result.lock().ok()
                                        .and_then(|r| r.clone())
                                        .filter(|r| r.get("requestId") == Some(&request_id))
                                        .unwrap_or_else(|| json!({
                                            "type": "result",
                                            "requestId": request_id,
                                            "status": "pending"
                                        }));
                                    if let Ok(text) = serde_json::to_string(&result) {
                                        response_bytes = format!("{}\n", text).into_bytes();
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                let mut written = 0u32;
                let _ = WriteFile(pipe, response_bytes.as_ptr() as *const _, response_bytes.len() as u32, &mut written, std::ptr::null_mut());
            }
            DisconnectNamedPipe(pipe);
            CloseHandle(pipe);
        }
    });
}

#[tauri::command]
fn get_vscode_context(state: State<'_, AppState>) -> Option<Value> {
    state.pending_context.lock().ok().and_then(|mut p| p.take())
}

#[tauri::command]
fn set_vscode_result(
    state: State<'_, AppState>,
    request_id: String,
    status: String,
    task: String,
    text: Option<String>,
    error: Option<String>,
    file_path: Option<String>,
) -> Result<(), String> {
    let value = json!({
        "type": "result",
        "requestId": request_id,
        "status": status,
        "task": task,
        "text": text.unwrap_or_default(),
        "error": error.unwrap_or_default(),
        "filePath": file_path.unwrap_or_default()
    });
    state.latest_bridge_result.lock()
        .map_err(|_| "Could not update VS Code bridge result.".to_string())
        .map(|mut result| *result = Some(value))
}

#[tauri::command]
fn vscode_bridge_status() -> Value {
    json!({"transport":"Windows named pipe","pipe":"\\\\.\\pipe\\CodeLens","read_only":true})
}

#[tauri::command]
fn redact_secrets(input: String) -> RedactionResult {
    let patterns = [
        r#"(?i)(api[_-]?key|password|passwd|secret|token|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{12,})["']?"#,
        r"AKIA[0-9A-Z]{16}",
        r"gh[pousr]_[A-Za-z0-9_]{20,}",
        r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    ];

    let mut output = input;
    let mut count = 0usize;

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            let replaced = re.replace_all(&output, |_: &regex::Captures| {
                count += 1;
                "[REDACTED]"
            });
            output = replaced.into_owned();
        }
    }

    RedactionResult { redacted: output, count }
}

#[tauri::command]
fn save_api_key(
    state: State<'_, AppState>,
    provider_id: String,
    api_key: String,
    persist: bool,
) -> Result<(), String> {
    if provider_id.trim().is_empty() || api_key.trim().is_empty() {
        return Err("Provider ID and API key are required.".into());
    }

    if let Ok(mut map) = state.session_keys.lock() {
        map.insert(provider_id.clone(), api_key.clone());
    }

    if persist {
        let entry = credential_entry(&provider_id)?;
        entry
            .set_password(&api_key)
            .map_err(|e| format!("Could not save API key to Windows Credential Manager: {e}"))?;
    } else if let Ok(entry) = credential_entry(&provider_id) {
        let _ = entry.delete_credential();
    }

    Ok(())
}

#[tauri::command]
fn delete_api_key(state: State<'_, AppState>, provider_id: String) -> Result<(), String> {
    if let Ok(mut map) = state.session_keys.lock() {
        map.remove(&provider_id);
    }

    let entry = credential_entry(&provider_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if msg.to_lowercase().contains("no entry")
                || msg.to_lowercase().contains("not found")
                || msg.to_lowercase().contains("no credential")
            {
                Ok(())
            } else {
                Err(format!("Could not remove stored API key: {e}"))
            }
        }
    }
}

#[tauri::command]
fn has_api_key(state: State<'_, AppState>, provider_id: String) -> bool {
    get_api_key(&state, &provider_id).is_some()
}

#[tauri::command]
async fn test_provider(
    state: State<'_, AppState>,
    provider_id: String,
    endpoint: String,
    kind: String,
    model: String,
    network_lock: bool,
) -> Result<ProviderTestResult, String> {
    if model.trim().is_empty() {
        return Err("Select a model before testing the provider.".into());
    }

    if kind == "cloud" && get_api_key(&state, &provider_id).is_none() {
        return Err("Cloud AI requires an API key before the connection can be tested.".into());
    }

    let url = validate_endpoint(&endpoint, &kind, network_lock)?;
    let target = format!("{}/models", url.as_str().trim_end_matches('/'));
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(target);
    if let Some(key) = get_api_key(&state, &provider_id) {
        request = request.bearer_auth(key);
    }

    let response = request.send().await.map_err(|e| format!("Connection failed: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = if body.len() > 300 { &body[..300] } else { &body };
        return Err(format!("Provider returned HTTP {}: {}", status, detail));
    }

    let body: Value = response.json().await.map_err(|e| format!("Invalid provider JSON: {e}"))?;
    let models = body.get("data").and_then(Value::as_array);
    let count = models.map(|a| a.len());

    if let Some(items) = models {
        let model_available = items.iter().any(|item| {
            item.get("id").and_then(Value::as_str) == Some(model.trim())
        });
        if !model_available {
            return Err(format!(
                "Connection succeeded, but model \"{}\" was not reported by the provider. Discover models or enter a valid model ID.",
                model.trim()
            ));
        }
    }

    Ok(ProviderTestResult {
        ok: true,
        message: match count {
            Some(n) => format!("Connection OK — model \"{}\" is available; {n} model(s) reported", model.trim()),
            None => format!("Connection OK — model \"{}\" accepted by provider", model.trim()),
        },
        model_count: count,
    })
}

#[tauri::command]
async fn discover_models(
    state: State<'_, AppState>,
    provider_id: String,
    endpoint: String,
    kind: String,
    network_lock: bool,
) -> Result<Vec<String>, String> {
    if kind == "cloud" && get_api_key(&state, &provider_id).is_none() {
        return Err("Cloud AI requires an API key before models can be discovered.".into());
    }

    let url = validate_endpoint(&endpoint, &kind, network_lock)?;
    let target = format!("{}/models", url.as_str().trim_end_matches('/'));
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(target);
    if let Some(key) = get_api_key(&state, &provider_id) {
        request = request.bearer_auth(key);
    }

    let response = request.send().await.map_err(|e| format!("Model discovery failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Provider returned HTTP {}", response.status()));
    }

    let body: Value = response.json().await.map_err(|e| format!("Invalid provider JSON: {e}"))?;
    let models = body
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "Provider response did not contain a /models data array.".to_string())?
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(ToOwned::to_owned))
        .collect::<Vec<_>>();

    if models.is_empty() {
        return Err("No model IDs were returned by the provider.".into());
    }

    Ok(models)
}

#[tauri::command]
async fn ai_chat(
    state: State<'_, AppState>,
    provider_id: String,
    endpoint: String,
    kind: String,
    model: String,
    prompt: String,
    network_lock: bool,
    privacy_mode: String,
) -> Result<serde_json::Value, String> {
    if prompt.len() > 200_000 {
        return Err("Request context is larger than the 200 KB safety limit.".into());
    }

    let url = validate_endpoint(&endpoint, &kind, network_lock)?;
    if privacy_mode == "local_only" && kind != "local" {
        return Err("Privacy mode is Local Only; cloud AI is blocked.".into());
    }
    if model.trim().is_empty() {
        return Err("A model is required.".into());
    }

    let chat_url = format!("{}/chat/completions", url.as_str().trim_end_matches('/'));
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let system = "You are CodeLens, a read-only coding assistant. Analyze the supplied developer context, explain errors, and suggest better solutions. Never claim to have edited files, executed commands, committed code, or changed the computer. Prefer precise, actionable explanations and show proposed changes as text or diffs only.";

    let payload = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    });

    let mut request = client.post(chat_url).json(&payload);
    if let Some(key) = get_api_key(&state, &provider_id) {
        request = request.bearer_auth(key);
    } else if kind != "local" {
        return Err("No API key configured for this provider.".into());
    }

    let response = request.send().await.map_err(|e| format!("AI request failed: {e}"))?;
    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        let detail = if body_text.len() > 500 { &body_text[..500] } else { &body_text };
        return Err(format!("AI provider returned HTTP {}: {}", status, detail));
    }

    let body: Value = serde_json::from_str(&body_text)
        .map_err(|e| format!("Provider returned invalid JSON: {e}"))?;

    let content = body
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Provider response did not contain choices[0].message.content.".to_string())?;

    Ok(json!({
        "text": content,
        "model": model,
        "provider": provider_id
    }))
}

#[tauri::command]
fn security_policy() -> serde_json::Value {
    json!({
        "read_source": true,
        "read_diagnostics": true,
        "read_terminal": true,
        "modify_files": false,
        "delete_files": false,
        "execute_commands": false,
        "git_commit": false,
        "git_push": false,
        "telemetry_default": false,
        "persistent_source_storage": false,
        "api_keys": "Windows Credential Manager when explicitly enabled; otherwise session memory only"
    })
}

#[tauri::command]
fn app_info() -> serde_json::Value {
    json!({
        "name": "CodeLens",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": "Windows",
        "mode": "read-only-by-default"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_context = Arc::new(Mutex::new(None));
    let latest_bridge_result = Arc::new(Mutex::new(None));
    start_vscode_bridge(pending_context.clone(), latest_bridge_result.clone());
    tauri::Builder::default()
        .manage(AppState {
            session_keys: Mutex::new(HashMap::new()),
            pending_context,
            latest_bridge_result,
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            redact_secrets,
            save_api_key,
            delete_api_key,
            has_api_key,
            test_provider,
            discover_models,
            ai_chat,
            get_vscode_context,
            set_vscode_result,
            vscode_bridge_status,
            security_policy,
            app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeLens");
}
