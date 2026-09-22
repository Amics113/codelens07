# CodeLens Architecture

```
IDE / Terminal adapter
        | read-only context
        v
Context broker -> secret redactor -> policy engine
        |                           |
        |                           +--> deny / ask
        v
AI provider abstraction
   |             |
 Local         Cloud
   |             |
   +-------> suggestion only
                |
                v
          User decides
```

The desktop shell should expose only narrowly scoped IPC commands. The frontend must not receive provider secrets. Provider adapters should implement timeouts, size limits, TLS-only cloud transport, error classification, cancellation, and explicit user policy checks.
