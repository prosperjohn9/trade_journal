# cTrader Open API protobuf definitions

Vendored, unmodified, from Spotware's official repository:
https://github.com/spotware/openapi-proto-messages

- `OpenApiCommonMessages.proto` / `OpenApiCommonModelMessages.proto`: the
  `ProtoMessage` envelope and common payload types (heartbeat, error).
- `OpenApiMessages.proto` / `OpenApiModelMessages.proto`: the Open API request/
  response messages and models.

We load these at runtime with `protobufjs` to talk to the cTrader Open API over a
TLS socket. We only ever use the read path (application auth, get accounts by
access token, account auth, deal list); we never send trade-execution messages.

Update by re-downloading the four files from the repo above if Spotware ships a
new protocol version.
