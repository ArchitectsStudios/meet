# VPS setup (54.38.159.143)

This VPS runs two kinds of workload:

- **blam.network**: a Next.js app in `/home/ubuntu/website`, outside Kubernetes. It runs as the systemd unit `blam-network.service` on `54.38.159.143:8443` and does its own TLS with certbot certificates.
- **k3s**: runs `meet` and any future services. Traefik in k3s owns ports 80 and 443 and routes by hostname.

```
internet :443 ──► Traefik (hostPort) ──┬─ SNI *.blam.network ──► TLS passthrough ──► host :8443 (blam-network.service)
                                       └─ meet.architectsstudio.dev ──► TLS (cert-manager) ──► web pod
internet :80  ──► Traefik ──┬─ *.blam.network /.well-known/acme-challenge/ ──► host :8888 (certbot standalone)
                            ├─ *.blam.network ──► redirect to https
                            └─ other hosts ──► cert-manager HTTP-01 solver / redirect to https
```

## Files

| File | Purpose |
| --- | --- |
| `traefik-values.yaml` | Helm values for Traefik: hostPort 80/443, ClusterIP service |
| `blam-network.yaml` | Routes for blam.network: TLS passthrough to :8443, certbot challenges to :8888, http→https redirect |
| `../k3s/cluster-issuer.yaml` | Let's Encrypt issuers for cert-manager |

## How it was set up

1. Swap: 2 GB at `/swapfile`, with `vm.swappiness=10`.
2. blam.network moved from a `screen` session to `blam-network.service`. The original `.env` is saved as `.env.bak-before-k3s`; the only change is `PORT=8443`.
3. ufw:
   - Opened `80/tcp`.
   - Allowed incoming traffic from `10.42.0.0/16` (pods) and `10.43.0.0/16` (services).
   - Added route rules for `10.42.0.0/16` in both directions, so ufw's forward chain lets pod traffic through.
4. k3s:

   ```sh
   curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --disable=traefik --disable=servicelb --write-kubeconfig-mode=600" sh -
   ```

   The bundled Traefik and ServiceLB are disabled so that nothing grabs port 443 by surprise. `KUBECONFIG=~/.kube/config` is set in `~/.bashrc`.
5. **Egress fix**: `k3s-egress-snat.service`.
   - ens3 lists `51.89.68.114` first, but that address cannot reach the internet. Flannel's MASQUERADE picks it, which breaks DNS and HTTPS from inside pods.
   - The service inserts an SNAT rule that sends pod traffic out from `54.38.159.143`.
6. Traefik via Helm:

   ```sh
   helm upgrade --install traefik traefik/traefik -n traefik --create-namespace -f traefik-values.yaml
   ```

7. Apply the blam.network routes: `kubectl apply -f blam-network.yaml`.
8. certbot:
   - Every file in `/etc/letsencrypt/renewal/*.conf` has `http01_port = 8888`. The originals are backed up in `/root/letsencrypt-renewal-backup/`.
   - The deploy hook `/etc/letsencrypt/renewal-hooks/deploy/restart-blam-network.sh` restarts blam.network after a renewal, because it reads its certificate only at startup.
9. cert-manager via Helm, then `kubectl apply -f ../k3s/cluster-issuer.yaml`.
10. meet:
    - The Secret comes from `~/infra/meet-secret.env` (mode 600, on the server only).
    - Deploy with `kubectl apply -k deploy/k8s/overlays/prod`.

## Day-to-day

| Task | Command |
| --- | --- |
| blam.network logs / restart | `journalctl -u blam-network -f` / `sudo systemctl restart blam-network` |
| Update blam.network | `cd ~/website && git pull && npm ci && npm run build && sudo systemctl restart blam-network` |
| meet pods | `kubectl -n meet get pods` |
| Edit meet secrets | edit `~/infra/meet-secret.env`, then `kubectl -n meet create secret generic meet-secrets --from-env-file=$HOME/infra/meet-secret.env --dry-run=client -o yaml \| kubectl apply -f - && kubectl -n meet rollout restart deploy/web deploy/bot` |
| Test certbot renewal | `sudo certbot renew --dry-run --no-random-sleep-on-renew` |

Do not start blam.network by hand in `screen` any more. It would clash with the systemd unit on port 8443.

## Known issues (existed before this setup)

- `api.xenia.blam.network`, `xenia.blam.network`, `halo3.xenia.blam.network`, `xenia.lsp.blam.network` and `beta.xbl.lsp.blam.network` resolve to `51.89.68.114`. That address does not accept connections from the internet, so those names are unreachable and their certificate cannot renew. To fix it, point their DNS at `54.38.159.143`; Traefik already passes `*.blam.network` through to blam.network.
- `www.blam.network` resolves to a different server (192.64.119.102).
- The old `blam.network` certificate lineage (with `www` and `xenia` names) expired on 5 Sep 2026 and is not used. blam.network uses `blam.network-0001`.
