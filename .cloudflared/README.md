# Cloudflare Tunnel (Fast Escbase)

Thư mục này đi kèm khi **nén/copy cả project** sang máy mới.

| File | Mô tả |
|------|--------|
| `credentials.json` | Secret tunnel — **không push lên Git public** (đã gitignore) |
| `config.yml` | Tự sinh lại bởi `scripts/ensure-cloudflared-config.sh` |

Sau khi giải nén trên Mac mới:

```bash
./scripts/setup-new-mac.sh
./scripts/start-with-tunnel.sh
```

Domain: https://fast.escbase.xyz
