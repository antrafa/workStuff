# Data generator

Generates Brazilian test data (person, CPF, CNPJ, name, address and company) that passes the systems' validations but belongs to no one.

## When to use

- You need to fill in a form in a test environment and cannot use a real person's CPF (the Brazilian individual taxpayer number).
- An automated test needs a valid CNPJ (the Brazilian company number), including the new format with letters.
- You want an address consistent with a chosen state to test a regional rule.

## Getting to know the screen

The screen has one card for each kind of data:

| Card | What it generates |
|---|---|
| **Full person** | Name, CPF, age and address consistent with each other. |
| **CPF** | A CPF with valid check digits. The 9th digit follows the tax region of the chosen state. |
| **CNPJ** | A CNPJ, numeric or in the Receita Federal's new alphanumeric format. |
| **Name** | First name and surnames, with the gender. |
| **Address** | Street, neighborhood, city and CEP (the postal code). |
| **Full company** | Legal name, CNPJ, CNAE (the economic activity code), size and address. |

## Step by step: generate data

1. Find the card for the kind of data you want.
2. If the card has the list of states, pick one (for example, **SC**) or leave **any state**.
3. On the CNPJ and company cards, check **alphanumeric** if the system you are testing already accepts the new format, with letters.
4. Click **Generate**. The result shows up in the card itself, one field per line.
5. Click the copy icon next to a field to copy just that one, or **copy all** to take every field at once.

> **Tip:** after the first one, the button becomes **Generate another**: each click replaces the result with new data.

## Good to know

- The documents pass the check digit but are fictitious: use them only for testing, never in production or in a real record.
- Everything is generated in the browser. Nothing is sent to the server or saved.
- The alphanumeric CNPJ follows the Receita Federal rule (IN RFB 2.229/2024) for the check digits. Systems that have not been updated yet may reject it.

## Common problems

- **The system rejected the CNPJ.** If you checked **alphanumeric**, the system may not accept letters yet. Uncheck it and generate again.
- **The CPF does not match the address state.** In **Full person**, pick the state before generating: the CPF and the address then come from the same region.
