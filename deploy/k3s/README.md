# Deploying to a single VPS with k3s

This guide sets up one VPS (Ubuntu or Debian, 4 GB RAM or more) to run `meet` and any later services.

- Traefik listens on ports 80 and 443 and routes each request by hostname, so many subdomains can share the same ports.
- cert-manager gets Let's Encrypt certificates for each Ingress.

> The production VPS also runs blam.network outside Kubernetes. Its exact setup is in [../vps/README.md](../vps/README.md); follow that file for that server.

## 1. DNS

Add these records at your DNS provider:

| Name             | Type | Value       |
| ---------------- | ---- | ----------- |
| `meet`           | A    | VPS IPv4    |
| `*` (optional)   | A    | VPS IPv4    |

The wildcard record lets any future `<name>.architectsstudios.dev` service work with only a new Ingress. You do not need to change DNS again.

## 2. Firewall

Open `80/tcp` and `443/tcp` to everyone. Open `6443/tcp` (the Kubernetes API) only to your own IP, or keep it closed and use `kubectl` over SSH.

```sh
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from <your-ip> to any port 6443 proto tcp
sudo ufw enable
```

## 3. Install k3s

Disable the bundled Traefik and ServiceLB. Traefik is installed with Helm in the next step, so you control exactly which ports it takes.

```sh
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --disable=traefik --disable=servicelb" sh -
sudo kubectl get nodes        # shows one node, Ready
```

If ufw is on, let pod traffic through it:

```sh
sudo ufw allow from 10.42.0.0/16
sudo ufw allow from 10.43.0.0/16
sudo ufw route allow from 10.42.0.0/16
sudo ufw route allow to 10.42.0.0/16
```

To use `kubectl` as your normal user:

```sh
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
```

To manage the cluster from your own computer, copy that file over and replace `127.0.0.1` with the VPS IP.

## 4. Install Traefik, cert-manager and the issuers

Install Helm, then Traefik on host ports 80 and 443:

```sh
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm repo add traefik https://traefik.github.io/charts
helm upgrade --install traefik traefik/traefik -n traefik --create-namespace -f deploy/vps/traefik-values.yaml
```

Then cert-manager:

```sh
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

Optionally add an `email:` to `deploy/k3s/cluster-issuer.yaml` for expiry notices, then apply it:

```sh
kubectl apply -f deploy/k3s/cluster-issuer.yaml
```

## 5. Image pull access

GitHub Actions pushes images to `ghcr.io/architectsstudios/meet-web` and `meet-bot`. Use one of these options:

- **Public images.** In GitHub, open each package, go to *Package settings* and set it to *Public*. No secret is needed.
- **Private images.** Create a GitHub personal access token with the `read:packages` scope. Then run:

  ```sh
  kubectl create namespace meet
  kubectl -n meet create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
  ```

## 6. App secrets

```sh
cp deploy/k8s/secret.example.env deploy/k8s/secret.env   # fill it in
kubectl create namespace meet --dry-run=client -o yaml | kubectl apply -f -
kubectl -n meet create secret generic meet-secrets --from-env-file=deploy/k8s/secret.env
```

The password in `MONGODB_URI` must match `MONGO_ROOT_PASSWORD`. MongoDB reads the root credentials only the first time it starts with an empty volume.

## 7. Deploy

```sh
kubectl apply -k deploy/k8s/overlays/prod
kubectl -n meet get pods,ingress,certificate
```

The certificate shows `READY=True` after about a minute. Then <https://meet.architectsstudios.dev> is live.

After that, each push to `main` builds new images. When you turn on the `deploy` job in `.github/workflows/build.yml`, it also rolls them out.

## Adding another service on a new subdomain

Give the service its own Ingress with its own `host` and TLS secret, and add the `cert-manager.io/cluster-issuer: letsencrypt-prod` annotation. `deploy/k3s/whoami-example.yaml` is a complete example:

```sh
kubectl apply -f deploy/k3s/whoami-example.yaml
curl https://whoami.architectsstudios.dev
```

## Operations

| Task                       | Command                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Logs                       | `kubectl -n meet logs deploy/bot -f` / `deploy/web`                                         |
| Restart after secret change | `kubectl -n meet rollout restart deploy/web deploy/bot`                                    |
| Run a backup now           | `kubectl -n meet create job --from=cronjob/mongo-backup backup-now`                         |
| Restore a backup           | `kubectl -n meet exec -i mongo-0 -- mongorestore --uri "$MONGODB_URI" --archive --gzip --drop < meet-XXXX.archive.gz` |
| Mongo shell                | `kubectl -n meet exec -it mongo-0 -- mongosh -u meet -p`                                    |

Backups go to `/var/backups/meet` on the VPS. That folder is on the same disk as the database, so copy it somewhere else regularly.
