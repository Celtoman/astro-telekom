import { homeHtml as html } from './general-home-render.ts';
export const ADDRESS_ONLY_TITLE = 'Проверьте подключение Дом.ру по адресу';
export const ADDRESS_ONLY_INTRO = 'Укажите город, улицу и дом — проверим возможность подключения Дом.ру по вашему адресу.';
export function renderAddressOnlyHeading() { return `<div class="address-only-heading"><h2>${ADDRESS_ONLY_TITLE}</h2><p>${ADDRESS_ONLY_INTRO}</p></div>`; }
export function renderAddressOnlyArt(asset: (path: string) => string) {
  return `<figure class="address-only-art"><img src="${html(asset('/images/general-home/address-house.png'))}" width="320" height="256" alt="" loading="lazy"><figcaption>Проверим<br>за пару секунд</figcaption></figure>`;
}
export function renderAddressOnlyPreview(asset: (path: string) => string) {
  return `<section class="home-block address-only" aria-label="Проверка подключения"><div class="address-only-copy">${renderAddressOnlyHeading()}<div class="address-only-preview"><label for="account-preview-address">Адрес подключения</label><div><input id="account-preview-address" placeholder="Город, улица, дом" disabled><button type="button" class="home-action" disabled>Проверить адрес</button></div></div><p class="address-only-reassurance"><img src="${html(asset('/images/general-home/address-shield.svg'))}" width="24" height="24" alt="">Проверка бесплатная и ни к чему не обязывает.</p></div>${renderAddressOnlyArt(asset)}</section>`;
}
