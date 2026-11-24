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
test('tariff and router callbacks keep the submission on error and restore the generic dialog on reopen', async t => {
  const previous = Object.fromEntries(['document','Element','location','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const document=node(),dialog=node(),form=node(),phone=node(),question=node(),consent=node(),submit=node(),label=node(),error=node(),phoneError=node(),spinner=node(),audience=node(),title=node(),icon=node(),iconImage=node(),success=node(),successButton=node(),support=node(),trigger=node();
  trigger.trigger=true; trigger.dataset={callbackTariffSlug:'internet-500',callbackTariffName:'Интернет 500',callbackCitySlug:'kazan',callbackCityName:'Казань'};
  const context=node(),intro=node(),successCopy=node();
  intro.textContent='Оставьте номер телефона.';
  successCopy.textContent='Специалист позвонит на указанный номер и ответит на вопросы';
  question.placeholder='Например: можно ли подключить интернет и ТВ?';
  form.nodes.set('[data-callback-context]',context);
  form.nodes.set('[data-callback-intro]',intro);
  dialog.nodes.set('[data-callback-success-copy]',successCopy);
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
  Object.assign(globalThis,{document,Element:Node,location:{href:'https://local-fixture.invalid/'},fetch:async (_url,options)=>{
    requests.push(JSON.parse(options.body));
    const ok = requests.length % 2 === 0;
    return { ok, json: async () => ok ? {id:'saved-consultation'} : {message:'Временный сбой'} };
  }});
  initializeCallbackDialog();
  const open=()=>{const event=new Event('click',{cancelable:true});Object.defineProperty(event,'target',{value:trigger});document.dispatchEvent(event);};
  const send=async()=>{form.dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));};
  open();assert.equal(context.hidden,false);assert.match(context.textContent,/Интернет 500.*Казань/);phone.value='+7 (999) 123-45-67';phone.dispatchEvent(new Event('input'));question.value='Нужна консультация';consent.checked=true;consent.dispatchEvent(new Event('change'));
  assert.equal(submit.disabled,false);
  existingButton.dispatchEvent(new Event('click'));await send();assert.equal(requests.length,0);assert.equal(support.hidden,false);assert.equal(form.hidden,true);
  newButton.dispatchEvent(new Event('click'));assert.equal(consent.checked,true);assert.equal(question.value,'Нужна консультация');
  await send();assert.equal(error.hidden,false);assert.equal(document.activeElement,error);assert.equal(label.textContent,'Попробовать ещё раз');assert.equal(consent.checked,true);assert.equal(phone.disabled,false);
  await send();assert.equal(requests.length,2);assert.equal(requests[0].submissionKey,requests[1].submissionKey);assert.equal(requests[0].phone,requests[1].phone);assert.equal(requests[0].citySlug,'kazan');assert.equal(requests[0].tariffSlug,'internet-500');assert.equal(requests[0].configuration,undefined);assert.equal(requests[0].reasonCode,'callback_consultation');assert.equal(requests[0].consentAccepted,true);assert.equal(requests[0].addressCheckId,undefined);assert.equal(success.hidden,false);
  dialog.close();trigger.dataset={};open();assert.equal(context.hidden,true);assert.equal(context.textContent,'');assert.equal(label.textContent,'Заказать звонок');assert.equal(phone.value,'');assert.equal(consent.checked,false);assert.equal(submit.disabled,true);assert.equal(success.hidden,true);assert.equal(form.hidden,false);assert.equal(title.textContent,'Заказать звонок');

  dialog.close();
  trigger.dataset={callbackRouterName:'Wave Mesh Plus AX3000'};
  open();
  assert.equal(document.activeElement,phone);
  assert.equal(title.textContent,'Консультация по роутеру');
  assert.equal(audience.hidden,true);
  assert.equal(context.hidden,false);
  assert.match(context.textContent,/Wave Mesh Plus AX3000/);
  assert.equal(label.textContent,'Оставить заявку');
  assert.match(intro.textContent,/условия покупки/);
  assert.match(question.placeholder,/роутер/);
  existingButton.dispatchEvent(new Event('click'));
  assert.equal(form.hidden,false);
  phone.value='+7 (999) 123-45-67';
  phone.dispatchEvent(new Event('input'));
  assert.equal(submit.disabled,true);
  consent.checked=true;
  consent.dispatchEvent(new Event('change'));
  await send();
  assert.equal(label.textContent,'Попробовать ещё раз');
  await send();
  assert.equal(requests.length,4);
  assert.deepEqual(requests[2],requests[3]);
  assert.equal(requests[3].reasonCode,'callback_consultation');
  assert.equal(requests[3].consentAccepted,true);
  assert.equal(requests[3].tariffSlug,undefined);
  assert.equal(requests[3].citySlug,undefined);
  assert.doesNotMatch(JSON.stringify(requests[3]),/Wave Mesh Plus AX3000/);
  assert.equal(success.hidden,false);
  assert.match(successCopy.textContent,/условия покупки роутера/);
  dialog.close();
  assert.equal(document.activeElement,trigger);
  trigger.dataset={};
  open();
  assert.equal(audience.hidden,false);
  assert.equal(context.hidden,true);
  assert.equal(title.textContent,'Заказать звонок');
  assert.equal(intro.textContent,'Оставьте номер телефона.');
  assert.equal(question.placeholder,'Например: можно ли подключить интернет и ТВ?');
  assert.doesNotMatch(successCopy.textContent,/роутера/);
});
