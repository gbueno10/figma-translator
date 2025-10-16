# 🌐 Figma Translator Plugin

A powerful Figma plugin that uses OpenAI's GPT to translate text elements quickly and accurately. Perfect for designers working on multilingual projects!

## ✨ Features

- **Automatic Translation**: Translates selected text in Figma using OpenAI API
- **10 Languages Supported**: English, German, French, Spanish, Portuguese (Brazil & Portugal), Italian, Dutch, Polish, Russian, Arabic
- **Duplicate & Translate**: Creates translated copies of your frames with proper language abbreviations
- **User-Friendly Interface**: Clean and intuitive UI with progress indicators
- **Secure**: API keys stored locally, no data collection

## 🚀 Quick Start Guide

### Step 1: Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Sign in or create an account
3. Click **"Create new secret key"**
4. Copy the key (starts with `sk-...`)
5. **Important**: Make sure you have credits in your OpenAI account

### Step 2: Install the Plugin in Figma

#### Option A: Install from Figma Community (Recommended)
1. Open Figma (desktop or web)
2. Go to **Community** → **Plugins**
3. Search for **"Figma Translator"**
4. Click **"Install"**

#### Option B: Install from Source Code (For Developers)
1. Download or clone this repository
2. Open terminal/command prompt
3. Navigate to the project folder
4. Run: `npm install`
5. Run: `npm run build`
6. In Figma, go to **Plugins** → **Development** → **Import plugin from manifest**
7. Select the `manifest.json` file from this project

### Step 3: Use the Plugin

1. **Open the Plugin**:
   - In Figma, go to **Plugins** → **Figma Translator**

2. **Enter Your API Key**:
   - Paste your OpenAI API key in the "API Key" field
   - The key will be saved securely in your browser

3. **Select Text Elements**:
   - Select one or more text layers in your Figma design
   - The plugin works with any text element

4. **Choose Languages**:
   - Check the boxes for languages you want to translate to
   - You can select multiple languages at once

5. **Translate**:
   - Click **"Duplicate and Translate"**
   - Watch the progress bar as translations are processed
   - New frames will appear with translated text and language codes (e.g., "Frame - FR", "Frame - DE")

## 🌍 Supported Languages

| Language | Code | Example Frame Name |
|----------|------|-------------------|
| French | FR | "My Frame - FR" |
| German | DE | "My Frame - DE" |
| Spanish | ES | "My Frame - ES" |
| Portuguese (Portugal) | PT-PT | "My Frame - PT-PT" |
| Portuguese (Brazil) | PT | "My Frame - PT" |
| Italian | IT | "My Frame - IT" |
| Dutch | NL | "My Frame - NL" |
| Polish | PL | "My Frame - PL" |
| Russian | RU | "My Frame - RU" |
| Arabic | AR | "My Frame - AR" |

## � Pro Tips

- **Select Multiple Elements**: You can select multiple text layers across different frames
- **Batch Translation**: Select multiple target languages to create several translated versions at once
- **Font Handling**: The plugin automatically handles missing fonts gracefully
- **Frame Organization**: Translated frames are created next to your original frame for easy comparison

## ⚠️ Requirements

- **Figma Account**: Desktop or web version
- **OpenAI Account**: With API access and available credits
- **Internet Connection**: Required for API calls

## � Troubleshooting

### "Invalid API Key" Error
- Double-check your OpenAI API key
- Make sure it starts with `sk-`
- Verify you have credits in your OpenAI account
- Try generating a new API key

### "Select at least one text element" Error
- Make sure you've selected text layers (not shapes or images)
- Text must be actual Figma text elements, not text in images

### Plugin Won't Load
- Try refreshing Figma
- Check your internet connection
- Make sure you're using the latest version of Figma

### Translation Errors
- Check your OpenAI account has sufficient credits
- Some text might be too long (try shorter text)
- Verify your API key hasn't expired

### Fonts Look Different
- The plugin preserves font families when possible
- If a font isn't available, Figma will use a fallback font
- This is normal behavior and doesn't affect functionality

## 🔒 Privacy & Security

- **Local Storage**: Your API key is stored only in your browser's local storage
- **No Data Collection**: We don't collect, store, or share your designs or text
- **Direct Connection**: The plugin connects directly to OpenAI's API
- **Open Source**: All code is available for review in this repository

## 🛠️ For Developers

### Development Setup
```bash
# Clone the repository
git clone https://github.com/gbueno10/figma-translator.git

# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes during development
npm run watch
```

### Project Structure
```
figma-translator/
├── src/
│   └── code.ts          # Main plugin logic
├── ui.html              # User interface
├── manifest.json        # Plugin configuration
├── tsconfig.json        # TypeScript config
└── package.json         # Dependencies
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

Need help? Here's how to get support:

1. **Check this README**: Most common issues are covered above
2. **GitHub Issues**: [Open an issue](https://github.com/gbueno10/figma-translator/issues) for bugs or feature requests
3. **Include Details**: When reporting issues, include:
   - Your operating system
   - Figma version (desktop/web)
   - Error messages (if any)
   - Steps to reproduce the problem

---

**Made with ❤️ by [gbueno10](https://github.com/gbueno10)**

*Happy translating! 🎨🌍*
