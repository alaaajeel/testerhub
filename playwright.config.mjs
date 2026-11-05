import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,use:{baseURL:'http://127.0.0.1:4173',serviceWorkers:'block'},webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',port:4173},projects:[{name:'android-layout',use:{...devices['Pixel 5']}},{name:'desktop',use:{viewport:{width:1280,height:900}}}]});
