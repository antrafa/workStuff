# HTTP requests

Calls an endpoint and shows the answer, without opening Postman or building the curl by hand: you keep the requests you repeat, switch environment with one click and paste the curl you copied from the browser.

## When to use

- You want to check that your application's `/health` endpoint answers after the new version went up.
- You opened a tunnel to a cluster service in [Local services](/servicos) and want to call `http://127.0.0.1:8080/api/orders`.
- A colleague sent a `curl` command and you want to repeat the call and read the answer formatted.
- You call the same endpoint in HML and in PRO, and only the address and the token change.

Some terms on this page:

- An **endpoint** is an address the application answers, for example `https://api.example.com/v1/orders`.
- The **method** says what the call does: `GET` reads, `POST` creates, `PUT` and `PATCH` change, `DELETE` removes.
- A **header** is a piece of information sent with the call, such as `Authorization: Bearer <token>`.
- An **environment** is a named set of values (for example HML), used in the request as `{{base}}` or `{{token}}`.

## Getting to know the screen

- **Saved**, on the left: the stored requests, grouped by the **Group** you gave them. The method shows in color: green reads, yellow changes, red removes. **New** starts a blank request.
- **Address line**: the method, the URL and the **Send** button. Enter in the address field also sends.
- **Environment**: the list next to **Environments** picks where the `{{variable}}` values come from. The screen remembers the last one picked.
- **Import curl** and **Copy as curl**: bring a curl command into the screen and take the current request back out, with the environment's values in place.
- **Name**, **Group**, **Save**, **Duplicate** and the trash can: store, copy and delete the request.
- **Headers** and **Body**: one header per line as `Name: value`. A line starting with `#` is left out, which switches a header off without deleting it.
- **Answer**: the status code (green for 2xx, blue for 3xx, yellow for 4xx, red for 5xx), the time, the size and the body. A JSON body shows formatted.

## Step by step: call an endpoint

1. Pick the method, for example `GET`.
2. Type the URL, for example `http://127.0.0.1:8080/actuator/health`.
3. If needed, open **Headers** and write, for example, `Accept: application/json`.
4. Click **Send**.
5. Read the answer below. **Headers** shows the headers that came back and **Copy body** copies the text.

### Keep a request

1. Fill in **Name** (for example `Orders health`) and, if you like, **Group** (for example `orders-api`).
2. Click **Save new**. It shows up under **Saved**.
3. After changing something in a saved request, click **Save**. The button is active only when there is a change.

### Use the same endpoint in HML and PRO

1. Click **Environments** and then **New environment**.
2. Name it `HML` and write one variable per line, for example `base=https://orders-hml.example.com` and `token=abc123`.
3. Create the `PRO` environment the same way, with the production values, and click **Save**.
4. In the request, use `{{base}}/v1/orders` in the URL and `Authorization: Bearer {{token}}` in the headers.
5. Pick the environment in the list and click **Send**. To switch environment, just change the pick in the list.

### Import a curl

1. In the browser, open DevTools, go to the **Network** tab, right click the call and choose **Copy** and then **Copy as cURL (bash)**.
2. In the panel, click **Import curl**, paste the command and click **Import**.
3. The method, URL, headers and body go into the screen. Give it a name and save it if you want to keep it.

## Good to know

- The call leaves from the panel's local server, not from the browser. That is why there is no CORS block, and a tunnel opened on 127.0.0.1 works.
- Headers and variables may hold tokens. They are kept in the `http-requests.json` file of your data folder, readable only by your user.
- The panel does not skip an invalid TLS certificate. If the server uses a certificate the machine does not trust, the call fails with a message saying so.
- An answer bigger than 5 MB is cut. A binary answer (image, PDF) shows only its size and headers.
- The call gives up after 60 seconds without an answer.

## Common problems

- **"nothing is listening at ... (connection refused)".** The application is not up on that port. If it is a cluster service, open a tunnel in [Local services](/servicos).
- **"The environment has no value for: token".** The request uses `{{token}}`, but the chosen environment has no such variable. Open **Environments** and add the line `token=...`.
- **"the name ... does not resolve (DNS)".** Check the address and whether the VPN is on.
- **"invalid header".** The header name has a space or another character HTTP does not accept. Check the `Name: value` line.
