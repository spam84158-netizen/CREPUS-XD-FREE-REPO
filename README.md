### CREPUS-XD BUG BOT 
   
<p align="center">
<img src="assets/images/crepus-xd.png" width="420"/> 
<p align="center">
  <a href="https://git.io/typing-svg"><img src="https://readme-typing-svg.demolab.com?font=EB+Garamond&weight=800&size=28&duration=4000&pause=1000&random=false&width=435&lines=+_____CREPUS+XD+BOT_____;WHATSAPP+CRASH+x+BUG+BOT;DEVELOPED+BY+ES⚡+TEAMS+TECH;REALESE+DATE+5%2F9%2F2024." alt="Typing SVG" /></a>
</p>

### If you want to deploy on panel, download bot zip file and upload it to your server 

### 1. <a href="https://github.com/paskito002/CREPUS-XD/fork"><img src="https://img.shields.io/badge/FORK-blue" alt="Click Here to fork CREPUS-XD" width="70"></a>

 ### 2. Deploy on Panel

 If you don't have an account in PANEL, create one and deploy.
    <br>
    <a href='https://control.bot-hosting.net/auth/login' target="_blank"><img alt='DEPLOY' src='https://img.shields.io/badge/-DEPLOY-black?style=for-the-badge&logo=bot-hosting.net&logoColor=white'/></a>
    
## WATCH VIDEO ON HOW TO DEPLOY ON PANEL.
* [![Video Loading..](https://img.shields.io/badge/HOW_TO_DEPLOY-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/v1V-hBS3tEQ)

### 3.
#### COPY THESE COMMANDS AND PASTE IF YOU TRYING TO DEPLOY [CREPUS-XD BUG BOT](https://github.com/paskito002/CREPUS-XD) ON ANY TERMINAL
```
sudo apt -y update && sudo apt -y upgrade
```
```
sudo apt -y install git ffmpeg curl
```
```
curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
```
```
sudo -E bash nodesource_setup.sh
```
```
sudo apt-get install -y nodejs
```
```
sudo npm install -g yarn
```
```
sudo yarn global add pm2
```
```
git clone https://github.com/type-your-username-here/CREPUS-XD
```
```
cd CREPUS-XD
yarn install 
npm start
```
 
# Termux Deployment

```
atp update
   

apt upgrade

pkg update && pkg upgrade

pkg install bash

 pkg install git

 pkg install nodejs

pkg install ffmpeg

pkg install wget

pkg install imagemagick

 pkg install yarn

termux-setup-storage
```

```
git clone https://github.com/paskito002/CREPUS-XD
```
```
 cd CREPUS-XD
```
```
yarn install
  ```
    
```
npm start
```

## ```Connect With Me```<img src="https://github.com/0xAbdulKhalid/0xAbdulKhalid/raw/main/assets/mdImages/handshake.gif" width ="80"></h1> 
 <br> 
<p align="center">
<a href="https://wa.me/2250566593696"><img src="https://img.shields.io/badge/Contact CREPUS XD-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
<a href="https://whatsapp.com/channel/0029Vb7t7R0Lo4hfdyYWLB38"><img src="https://img.shields.io/badge/Join Official Channel-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
<a href="https://www.youtube.com/"><img src="https://img.shields.io/badge/Subscribe-ff0000?style=for-the-badge&logo=youtube&logoColor=ff000000&link=https://www.youtube.com/" /><br>
<p align="center">
<img alt="Development" width="250" src="https://media2.giphy.com/media/W9tBvzTXkQopi/giphy.gif?cid=6c09b952xu6syi1fyqfyc04wcfk0qvqe8fd7sop136zxfjyn&ep=v1_internal_gif_by_id&rid=giphy.gif&ct=g" /> </p>
 
## Telegram pairing gateway

Set these environment variables on the persistent server:

- `TELEGRAM_BOT_TOKEN` = token from BotFather
- `CREPUS_CHANNELS / CREPUS_CHANNELS` = 2-3 channels, comma-separated (example: `@crepus_news,@crepus_updates,@crepus_support`)
- `CREPUS_TG_WELCOME_IMAGE / CREPUS_TG_WELCOME_IMAGE` = optional image URL sent on `/start`
- `CREPUS_TG_WELCOME_AUDIO / CREPUS_TG_WELCOME_AUDIO` = optional audio URL sent after the welcome message
- `CREPUS_TG_ADMIN / CREPUS_TG_ADMIN` = optional admin contact

The Telegram flow is gated: `/start` → welcome → join required channels → membership verification → protected menu → WhatsApp pairing. The bot checks every required channel before allowing pairing.

For reliable membership checks, add the Telegram bot to the required channels with enough access to call `getChatMember` (administrator access is recommended for private channels).
