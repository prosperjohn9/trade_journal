# cTrader Open API protobuf definitions

Vendored, unmodified, from Spotware's official repository:
https://github.com/spotware/openapi-proto-messages

- `OpenApiCommonMessages.proto` / `OpenApiCommonModelMessages.proto`: the
  `ProtoMessage` envelope and common payload types (heartbeat, error).
- `OpenApiMessages.proto` / `OpenApiModelMessages.proto`: the Open API request/
  response messages and models.

We load these to talk to the cTrader Open API over a TLS socket. We only ever use
the read path (application auth, get accounts by access token, account auth,
symbols list, deal list); we never send trade-execution messages.

## `ctrader.json` (generated)

`.proto` files are not traced into the serverless bundle, so at runtime we load a
precompiled protobufjs descriptor instead. Regenerate it from the four `.proto`
files whenever they change:

```
node -e "const pb=require('protobufjs'),fs=require('fs'),p='src/lib/integrations/ctrader-proto';pb.load(['OpenApiCommonMessages','OpenApiCommonModelMessages','OpenApiModelMessages','OpenApiMessages'].map(f=>p+'/'+f+'.proto')).then(r=>fs.writeFileSync(p+'/ctrader.json',JSON.stringify(r.toJSON())))"
```

Update the protos by re-downloading the four files from the repo above if
Spotware ships a new protocol version, then regenerate `ctrader.json`.
