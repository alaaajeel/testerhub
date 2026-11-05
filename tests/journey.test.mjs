import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function playLinks('),html.indexOf('function joinLink('));
const context=vm.createContext({URL});vm.runInContext(source,context);
const links=raw=>context.playLinks(raw);
test('closed testing URL produces separate store link without changing opt-in URL',()=>{
 const raw='https://play.google.com/apps/testing/com.example.app?hl=ar';
 assert.equal(links(raw).join,raw);
 assert.equal(links(raw).store,'https://play.google.com/store/apps/details?id=com.example.app');
});
test('store URL canonicalizes package and never invents an installed-app launch URL',()=>{
 assert.equal(links('https://play.google.com/store/apps/details?id=com.example_app.mobile&hl=ar').store,'https://play.google.com/store/apps/details?id=com.example_app.mobile');
});
test('malicious origins and malformed packages cannot create store destinations',()=>{
 for(const raw of ['javascript:alert(1)','http://play.google.com/apps/testing/com.example.app','https://play.google.com.evil.test/apps/testing/com.example.app','https://user@play.google.com/apps/testing/com.example.app','https://play.google.com:444/apps/testing/com.example.app','not a URL'])assert.equal(links(raw).join,null);
 for(const raw of ['https://play.google.com/apps/testing/test','https://play.google.com/store/apps','https://play.google.com/store/apps/details?id=com..example','https://play.google.com/apps/testing/com.example/evil'])assert.equal(links(raw).store,null);
});
