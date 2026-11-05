'use strict';
// Owner-only, one-time local/Cloud Shell command. NEVER run from web browser or CI.
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const EMAIL='dhi98886@gmail.com';
async function main(){
 if(process.argv[2]!=='--confirm-grant')throw new Error('Pass --confirm-grant after verifying the authorized Firebase account');
 initializeApp({projectId:'testhubiq-c7711'});
 const auth=getAuth();
 const account=await auth.getUserByEmail(EMAIL);
 if(!account.emailVerified||account.disabled)throw new Error('Admin account must be verified and enabled');
 await auth.setCustomUserClaims(account.uid,{...(account.customClaims||{}),testerhubAdmin:true});
 await auth.revokeRefreshTokens(account.uid);
 console.log('Admin claim granted to verified account ending: '+EMAIL.slice(-10));
 console.log('Sign out and sign in again to refresh your Firebase ID token');
}
main().catch(err=>{console.error(err.message);process.exitCode=1});
