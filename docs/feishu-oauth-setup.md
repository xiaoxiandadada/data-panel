# Feishu OAuth Setup

This project uses Feishu OAuth as the formal login path. Requesters and admins both log in with Feishu. The backend maps Feishu users to roles by email or open_id.

## 1. Create or reuse a Feishu app

Use a dedicated enterprise self-built app named `交付管线` when possible.

In Feishu Developer Console:

1. Open the app detail page.
2. Copy `App ID` to `LARK_APP_ID`.
3. Open **凭证与基础信息 / Credentials & Basic Info**, click the App Secret reveal/copy control, and copy it to `LARK_APP_SECRET`.
4. Add the redirect URL:

```text
https://<deployment-domain>/api/auth/lark/callback
```

For local testing, use:

```text
http://127.0.0.1:5173/api/auth/lark/callback
```

If Feishu rejects localhost, use an HTTPS tunnel and set:

```text
https://<temporary-tunnel-domain>/api/auth/lark/callback
```

## 2. Required environment variables

Give deployment engineers this block through a secure channel. Do not commit real secrets.

```env
AUTH_MOCK_ENABLED=false
LARK_APP_ID=<Feishu App ID>
LARK_APP_SECRET=<Feishu App Secret>
LARK_REDIRECT_URI=https://<deployment-domain>/api/auth/lark/callback
LARK_AUTH_HOST=https://open.feishu.cn
LARK_API_HOST=https://open.feishu.cn

LARK_SUPER_ADMIN_EMAILS=<super-admin-email>
LARK_DELIVERY_ADMIN_EMAILS=<delivery-admin-email-1>,<delivery-admin-email-2>
LARK_PURCHASE_ADMIN_EMAILS=<purchase-admin-email-1>
```

`LARK_APP_SECRET` must be provided by the Feishu app owner or a Feishu app administrator. It should be stored in the server environment, CI secret store, or Alibaba Cloud secret manager.

## 3. Feishu contacts picker

The UI can search Feishu users for requester, follower, project owner and solution owner fields.

Backend endpoint:

```text
GET /api/lark/users/search?q=<keyword>&limit=12
```

This endpoint uses the app's `tenant_access_token` and Feishu user search API. If the dev environment returns a permission error, enable the app permissions related to searching users / reading basic contact information in Feishu Developer Console, publish or apply the app change, then retry.

## 4. Role mapping

Prefer email mapping first:

- `LARK_SUPER_ADMIN_EMAILS`: can see and operate all admin views.
- `LARK_DELIVERY_ADMIN_EMAILS`: delivery ledger and owner views.
- `LARK_PURCHASE_ADMIN_EMAILS`: purchase-related admin views.

If email permission is unavailable, use open_id mapping instead:

```env
LARK_SUPER_ADMIN_OPEN_IDS=
LARK_DELIVERY_ADMIN_OPEN_IDS=
LARK_PURCHASE_ADMIN_OPEN_IDS=
```

## 5. Local verification

After filling the secret:

```bash
docker compose up -d --build delivery-pipeline
curl -I http://127.0.0.1:5173/api/auth/lark/login
```

Expected result: HTTP 302 redirect to Feishu OAuth.

Then open:

```text
http://127.0.0.1:5173
```

Click login. After Feishu authorization, the app should return to the dashboard and `/api/auth/me` should show the current Feishu user.

Verify the Feishu contacts picker after login:

```bash
curl "http://127.0.0.1:5173/api/lark/users/search?q=张&limit=5" --cookie "<browser-session-cookie>"
```
