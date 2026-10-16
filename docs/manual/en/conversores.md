# Converters

Gathers in one screen the small everyday conversions of development work (reading a JWT token, decoding Base64, making sense of a date written as a number, testing a regular expression) and does it all in the browser, without sending what you paste anywhere.

## When to use

- An API rejected your access and you want to see what is inside the token and whether it has expired.
- A log shows the date as `1758153600` and you want to know which day and time that is.
- You need to format an unreadable JSON or turn it into YAML for a configuration file.
- You want to know when a schedule such as `0 8 * * 1-5` will run.
- You want to compare two versions of a text or test a regular expression before using it in code.

## Getting to know the screen

The screen has one card per tool. The result shows up in the card itself as you type, and almost always comes with the copy icon next to it.

| Card | What it does |
|---|---|
| **JWT** | Opens a JWT token (the "badge" many systems use to prove who you are) and shows its two readable parts, **Header** and **Payload**, and whether the token is **valid** or **expired**. |
| **SQL Bind** | Takes a parameterized SQL query (`?`) together with Hibernate, JDBC or MyBatis parameter binding log lines and produces the formatted query with the values filled in. |
| **JVM & K8s Memory** | Calculates whether Java Heap (`MaxRAMPercentage` or `-Xmx`) plus Non-Heap (`Metaspace`, `Direct`, thread stacks and code cache) fit inside the Kubernetes pod memory limit without triggering `OOMKilled` (exit code 137). |
| **X.509 PEM** | Decodes a `-----BEGIN CERTIFICATE-----` PEM certificate in the browser and shows Subject, Issuer, serial number, validity dates and SANs (Subject Alternative Names). |
| **Base64** | Encodes text as Base64 (a way of writing any data with letters and numbers only) and decodes it back. It also accepts the base64url variant. |
| **URL** | Replaces special characters with the `%` codes used in web addresses (for example, a space becomes `%20`), and undoes that. |
| **Timestamp** | Turns a timestamp (a date counted in seconds or milliseconds since 1970) into a readable date, in your time zone and in UTC. |
| **UUID** | Generates random unique identifiers (UUID version 4), one or several at a time. |
| **Cron** | Shows the next 5 runs of a cron expression (the 5-field scheduling format: minute, hour, day, month and day of the week). |
| **JSON** | Formats, minifies and validates JSON, pointing to the line and column of the error, and converts to and from YAML. |
| **Diff** | Compares two texts line by line and marks what was removed and what was added. |
| **Regex** | Tests a regular expression (a search pattern for text) and lists every match and its groups. |
| **Hash** | Calculates the SHA-256, SHA-1 and SHA-512 digest of a text. |

## Step by step: use a tool

1. Find the tool's card.
2. If the card has a direction switch, choose what you want to do, for example **Decode** or **Encode**.
3. Paste or type the content into the text box. The result shows right below.
4. Click the copy icon next to the result to put it on the clipboard.

### Read a JWT token

1. In the **JWT** card, paste the token. To see how it works, click **use an example**.
2. Check the **valid** or **expired** tag and the **expires at** and **issued at** dates.
3. Read the **Header** (the token type) and the **Payload** (the data, such as user and permissions).

### Encode or decode Base64 and URL

1. In the **Base64** or **URL** card, choose **Decode** (the default) or **Encode**.
2. Paste the text. If it cannot be converted in that direction, the card says why.

### Convert a timestamp

1. In the **Timestamp** card, paste the number, for example `1758153600`. To use the current instant, click **Now**.
2. See the **Unit** the panel recognized (seconds or milliseconds), the date in your time zone and the date in **ISO (UTC)**, the international standard format.

### Generate UUIDs

1. In the **UUID** card, click **Generate 1**, **Generate 5** or **Generate 20**.
2. Copy them one by one or, when there is more than one, click **copy all**.

### See when a cron will run

1. In the **Cron** card, type the expression or click one of the ready examples, such as `0 8 * * 1-5` (8 a.m., Monday to Friday).
2. Read the list of the next 5 runs, in your computer's time.

### Work with JSON and YAML

1. In the **JSON** card, choose the mode:
   - **Format**: lays the JSON out with indentation, easy to read.
   - **Minify**: removes spaces and line breaks, putting everything on one line.
   - **To YAML**: converts the JSON to YAML, the format many configuration files use.
   - **From YAML**: converts YAML to JSON. Several documents separated by `---` are accepted.
2. Paste the content. If the JSON is wrong, the screen shows the line, the column and the character at fault.

### Compare two texts

1. In the **Diff** card, paste the old version into the **before** box and the new one into the **after** box.
2. Read the result: lines with `-` were removed, lines with `+` were added. The screen also says how many lines differ, or that the two texts are the same.

### Test a regular expression

1. In the **Regex** card, type the pattern between the slashes, for example `(\w+)@(\w+)\.com`.
2. In the small field on the right, adjust the options (flags): `g` (every match), `i` (ignore upper and lower case), `m`, `s`, `u` or `y`.
3. Paste the text to search. Each match shows with its position (`@0`, `@15`...) and the captured groups (`$1`, `$2`...).

### Calculate a hash

1. In the **Hash** card, paste the text.
2. Copy the digest of the algorithm you need: **SHA-256**, **SHA-1** or **SHA-512**.

## Good to know

- Nothing you paste leaves the machine: every conversion runs in the browser, without going through the panel's server.
- The JWT is only decoded. Its signature is not checked, so the screen does not prove the token is authentic.
- In **Timestamp**, numbers with 11 digits or more are read as milliseconds; shorter ones as seconds.
- In **Cron**, if you restrict both the day of the month and the day of the week, either one counts, as in real cron: `0 0 1 * 0` runs on every 1st and also every Sunday. A `7` in the day of the week is also Sunday.
- **Diff** compares up to 4000 lines on each side.
- **Regex** shows at most 500 matches.
- **Hash** does not calculate MD5, because the browser does not offer that algorithm.
- Nothing is saved: when you leave the screen, the fields come back empty.

## Common problems

- **"A JWT has three parts separated by dots".** The pasted text is not a complete token. Copy the whole token, with all three parts.
- **"Invalid input to decode".** The text is not valid Base64 (or URL-encoded text), or the direction is swapped. Check that you chose **Decode** or **Encode** correctly.
- **"invalid JSON at line 3, column 12".** Go to that position: it is usually a trailing comma at the end of a list, single quotes instead of double quotes, or an unclosed brace.
- **"expected 5 fields" in Cron.** The expression has too many or too few fields. Expressions with seconds (6 fields) or shortcuts like `@daily` are not accepted.
- **"text too large" in Diff.** One side has more than 4000 lines. Compare it in smaller pieces.
