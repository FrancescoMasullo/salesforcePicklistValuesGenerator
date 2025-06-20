# 🚀 Salesforce Picklist XML Generator

A lightweight web tool to generate deployment-ready XML files for Salesforce picklist values, including both custom fields and global value sets. Designed to streamline the creation and deployment of metadata via Salesforce Workbench.

## 📦 Features

- Two modes: **Custom Field** and **Global Value Set**
- Copy-paste input from Excel supported (API Name and Label)
- Auto-detects tab- or comma-separated values
- Automatically generates:
  - Picklist value XML
  - Full XML file for deployment
  - `package.xml`
- Creates a ready-to-deploy ZIP archive
- Direct link to Salesforce Workbench
- Escapes special XML characters automatically
- Includes keyboard shortcuts for power users:
  - `Ctrl/Cmd + Enter`: Generate XML
  - `Ctrl/Cmd + Shift + C`: Copy complete XML
  - `Ctrl/Cmd + Shift + D`: Download ZIP

## 🛠️ How to Use

1. Choose the mode (Custom Field or Global Value Set)
2. Fill in the required API names and labels
3. Paste Excel data into the input field
4. Click **Generate XML** or use a keyboard shortcut
5. Download the deployment-ready ZIP or copy the XML
6. Use Salesforce Workbench to deploy the ZIP

## 📄 License

MIT License
