import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeCallbackDialog} from '../apps/web/src/lib/callback-client.mjs';

// Small event/DOM fixture: exercises the shipped client without a browser dependency
// and without sending any request to the project's API.
class Node extends EventTarget {
  dataset = {}; hidden = false; disabled = false; value = ''; checked = false; textContent = ''; attributes = new Map(); nodes = new Map();
  querySelector(selector) { return this.nodes.get(selector); }
  querySelectorAll(selector) { return this.nodes.get(selector) || []; }
  setAttribute(name, value) { this.attributes.set(name,value); }
  focus() { globalThis.document.activeElement = this; }
  closest(selector) { return selector === '[data-callback-trigger]' && this.trigger ? this : null; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
}
const node = () => new Node();
test('callback error keeps the submission, retry is idempotent, and reopening success resets CTA and consent', async t => {
  const previous = Object.fromEntries(['document','Element','location','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const document=node(),dialog=node(),form=node(),phone=node(),question=node(),consent=node(),submit=node(),label=node(),error=node(),phoneError=node(),spinner=node(),audience=node(),title=node(),icon=node(),iconImage=node(),success=node(),successButton=node(),support=node(),trigger=node();
  trigger.trigger=true;
  const newButton=node(),existingButton=node();newButton.dataset.callbackMode='new';existingButton.dataset.callbackMode='existing';
  audience.querySelectorAll=()=>[newButton,existingButton];
  document.referrer='';document.nodes.set('[data-callback-dialog]',dialog);document.nodes.set('[data-callback-trigger]',trigger);
  dialog.dataset={apiUrl:'https://local-fixture.invalid/api/v1',siteSlug:'domru-site',citySlug:'',successIcon:'/success.svg',callIcon:'/call.svg',supportIcon:'/support.svg'};
  form.dataset.consentVersion='lead-form-v1-2026-09-22';form.elements={phone,comment:question,consent,website:node()};
  form.reset=()=>{phone.value='';question.value='';consent.checked=false;};
  for(const [selector,value] of [['[data-callback-form]',form],['[data-callback-audience]',audience],['[data-callback-support]',support],['[data-callback-success]',success],['[data-callback-success] button',successButton],['#callback-title',title],['[data-callback-icon]',icon]])dialog.nodes.set(selector,value);
  for(const [selector,value] of [['[type=submit]',submit],['[data-callback-submit-label]',label],['[data-callback-error]',error],['[data-callback-phone-error]',phoneError],['[data-callback-spinner]',spinner]])form.nodes.set(selector,value);
  icon.nodes.set('img',iconImage);error.hidden=phoneError.hidden=spinner.hidden=success.hidden=support.hidden=true;
  const requests=[];
  Object.assign(globalThis,{document,Element:Node,location:{href:'https://local-fixture.invalid/'},fetch:async (_url,options)=>{requests.push(JSON.parse(options.body));return{ok:requests.length>1,json:async()=>requests.length===1?{message:'Временный сбой'}:{id:'saved-consultation'}};}});
  initializeCallbackDialog();
  const open=()=>{const event=new Event('click',{cancelable:true});Object.defineProperty(event,'target',{value:trigger});document.dispatchEvent(event);};
  const send=async()=>{form.dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));};
  open();phone.value='+7 (999) 123-45-67';phone.dispatchEvent(new Event('input'));question.value='Нужна консультация';consent.checked=true;consent.dispatchEvent(new Event('change'));
  assert.equal(submit.disabled,false);
  existingButton.dispatchEvent(new Event('click'));await send();assert.equal(requests.length,0);assert.equal(support.hidden,false);assert.equal(form.hidden,true);
  newButton.dispatchEvent(new Event('click'));assert.equal(consent.checked,true);assert.equal(question.value,'Нужна консультация');
  await send();assert.equal(error.hidden,false);assert.equal(document.activeElement,error);assert.equal(label.textContent,'Попробовать ещё раз');assert.equal(consent.checked,true);assert.equal(phone.disabled,false);
  await send();assert.equal(requests.length,2);assert.equal(requests[0].submissionKey,requests[1].submissionKey);assert.equal(requests[0].phone,requests[1].phone);assert.equal(requests[0].citySlug,undefined);assert.equal(requests[0].reasonCode,'callback_consultation');assert.equal(requests[0].consentAccepted,true);assert.equal(requests[0].addressCheckId,undefined);assert.equal(success.hidden,false);
  dialog.close();open();assert.equal(label.textContent,'Заказать звонок');assert.equal(phone.value,'');assert.equal(consent.checked,false);assert.equal(submit.disabled,true);assert.equal(success.hidden,true);assert.equal(form.hidden,false);assert.equal(title.textContent,'Заказать звонок');
});
