import { useEffect, useState } from 'react';

type EquipmentChoice = { code: 'router' | 'tvbox'; title: string; options: Array<{
  code: 'INSTALLMENT' | 'BUYOUT'; title: string; monthlyAmount: number; oneTimeAmount: number;
}> };
type ServiceChoice = { code: string; title: string; monthlyAmount: number; oneTimeCharges: Array<{
  code: string; title: string; amount: number;
}> };
type Selection = { router: 'NONE' | 'INSTALLMENT' | 'BUYOUT'; tvbox: 'NONE' | 'INSTALLMENT' | 'BUYOUT'; services: string[] };
type Quote = {
  selection: Selection;
  choices: { equipment: EquipmentChoice[]; services: ServiceChoice[] };
  charges: { monthly: Array<{ code: string; title: string; amount: number }>;
    oneTime: Array<{ code: string; title: string; amount: number | null }> };
  totals: { monthly: number; oneTime: number | null; knownOneTime: number };
};

const initialSelection: Selection = { router: 'NONE', tvbox: 'NONE', services: [] };
const rubles = (amount: number) => `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;

export default function TariffConfigurator(props: {
  apiUrl: string; siteSlug: string; citySlug: string; tariffSlug: string;
}) {
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const path = ['public', 'sites', props.siteSlug, 'cities', props.citySlug, 'tariffs', props.tariffSlug, 'quote']
      .map(encodeURIComponent).join('/');
    fetch(`${props.apiUrl.replace(/\/$/, '')}/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selection), signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Не удалось рассчитать стоимость. Попробуйте ещё раз.');
      return response.json() as Promise<Quote>;
    }).then((next) => {
      setQuote(next);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать стоимость.');
      setLoading(false);
    });
    return () => controller.abort();
  }, [props.apiUrl, props.siteSlug, props.citySlug, props.tariffSlug, selection]);

  const equipment = quote?.choices.equipment ?? [];
  const services = quote?.choices.services ?? [];
  return <div className="tariff-configurator" aria-busy={loading}>
    <h2>Соберите свой тариф</h2>
    <p>Дополнительное оборудование и услуги не выбраны по умолчанию.</p>
    {loading && <p role="status">Рассчитываем стоимость…</p>}
    {error && <p role="alert">{error}</p>}
    {equipment.map((item) => <fieldset key={item.code}>
      <legend>{item.title}</legend>
      <select aria-label={item.title} value={selection[item.code]} onChange={(event) => {
        setLoading(true);
        setSelection((previous) => ({ ...previous, [item.code]: event.target.value }));
      }}>
        <option value="NONE">У меня свой / не нужно</option>
        {item.options.map((option) => <option value={option.code} key={option.code}>
          {option.title} — {option.monthlyAmount ? `${rubles(option.monthlyAmount)}/мес.` : rubles(option.oneTimeAmount)}
        </option>)}
      </select>
    </fieldset>)}
    {services.map((item) => <label className="service-choice" key={item.code}>
      <input type="checkbox" checked={selection.services.includes(item.code)} onChange={(event) => {
        setLoading(true);
        setSelection((previous) => ({ ...previous, services: event.target.checked
          ? [...previous.services, item.code]
          : previous.services.filter((code) => code !== item.code) }));
      }} />
      {item.title} — {rubles(item.monthlyAmount)}/мес.
    </label>)}
    {quote && !loading && !error && <div aria-live="polite">
      <h3>Ежемесячно</h3>
      <ul>{quote.charges.monthly.map((item) => <li key={item.code}>{item.title}: {rubles(item.amount)}</li>)}</ul>
      <strong>{rubles(quote.totals.monthly)}/мес.</strong>
      {quote.charges.monthly.some((item) => item.code === 'router' || item.code === 'tvbox')
        && <p>Платёж по рассрочке входит в эту сумму только на указанный для оборудования срок.</p>}
      <h3>Разовые платежи</h3>
      <ul>{quote.charges.oneTime.map((item) => <li key={item.code}>
        {item.title}: {item.amount === null ? 'стоимость уточняется' : rubles(item.amount)}
      </li>)}</ul>
      <strong>{quote.totals.oneTime === null
        ? `Известная часть: ${rubles(quote.totals.knownOneTime)}; полная сумма уточняется`
        : rubles(quote.totals.oneTime)}</strong>
    </div>}
    <p className="configurator-disclaimer">Расчёт предварительный. Выбор пока не передаётся в заявку —
      состав и итоговую стоимость подтвердит оператор.</p>
  </div>;
}
