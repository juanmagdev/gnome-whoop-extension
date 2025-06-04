# 💤 GNOME Whoop Info Extension

**GNOME Whoop Info** is a lightweight GNOME Shell extension that connects to your [WHOOP](https://www.whoop.com/) account and displays your most important daily health metrics directly in the top bar of your GNOME desktop.

Whether you're monitoring your **recovery**, **sleep** and **strain**, this extension gives you a quick and unobtrusive glance at your status—without having to check your phone.

<div align="center">
  <img src="/img/image.png" alt="" width="500"/>
</div>

<div align="center">
  <img src="/img/image-2.png" alt="" width="500"/>
</div>

---

⚠️ **Important:**  
Before the extension can display your WHOOP data, you must authenticate your account and generate the required access tokens.

Please make sure to **carefully follow the Installation Guide** below to connect your WHOOP account successfully.

---

Once set up, the extension runs in the background and updates your data automatically throughout the day.

---

## 🛠️ Installation Guide
<!-- [Installation Guide](#-installation-guide) -->

To use this extension, you'll first need to create a WHOOP developer application and obtain the necessary credentials.

### 1. Create a Developer App on WHOOP

1. Visit the [WHOOP Developer Portal](https://developer.whoop.com/).
![Create App](/img/image-3.png)
1. Log in with your WHOOP account.
2. Click **“Create an App”** and fill out the form as follows:

   | Field             | Value                                      |
   |-------------------|--------------------------------------------|
   | **App Name**      | GNOME                                      |
   | **Contact Email** | your@email.com                             |
   | **Privacy Policy**| https://whoop.com                          |
   | **Redirect URI**  | `http://localhost:8000/callback`           |
   | **Scopes**        | Select **all** available scopes            |
   | **Webhook URL**   | (Leave empty)                              |

3. After creating the app, you’ll receive your **Client ID** and **Client Secret**.

![App Created](/img/image-4.png)

---

### 2. Obtain Access and Refresh Tokens

To authenticate the extension:

1. Open a terminal and navigate to the extension folder:

   ```bash
   cd ~/.local/share/gnome-shell/extensions/whoop-info@juanmag.dev
   ```
2. Run the authentication script:
    ```
    ./whoopAuth.sh
    ```
3. When prompted:
   1. Enter your Client ID and Client Secret.
   2. A URL will be shown. Open it in your browser and log in with your WHOOP account.
   3. After authorization, copy the full redirected URL and paste it into the terminal when asked.

If successful, a `tokens.json` file will be generated containing your access and refresh tokens.

### 3. Activate the Extension
To activate the extension, restart GNOME Shell. You should now see your WHOOP metrics displayed in the top bar of your GNOME desktop.