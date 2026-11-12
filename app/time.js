// R5: times in the viewer's own time zone and date order (dd/mm for EU locales, mm/dd for en-US).

/** "12/11 17:29" style: day and month in the locale's order, joined with "/", then 24 h or 12 h time as the locale reads it. */
export function formatLocal(iso, locale = navigator.language, timeZone = undefined) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone })
    .formatToParts(date)
    .filter((p) => p.type === 'day' || p.type === 'month')
    .map((p) => p.value)
    .join('/');
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(date);
  return `${dayMonth} ${clock}`;
}
