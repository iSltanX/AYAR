// نصوص الواجهة بلغتين. اللغة من ?lang= (الافتراضي ar).
export const messages = {
  ar: {
    title: 'سوق الأجهزة',
    langToggle: 'English',
    themeLight: 'الوضع الفاتح',
    themeDark: 'الوضع الداكن',
    loading: 'جارٍ تحميل العناصر…',
    error: 'حدث خطأ ما',
    empty: 'لا عناصر لعرضها',
    available: 'متاح',
    soldOut: 'نفد',
    account: 'حسابي',
    balance: 'الرصيد',
  },
  en: {
    title: 'Device Market',
    langToggle: 'العربية',
    themeLight: 'Light mode',
    themeDark: 'Dark mode',
    loading: 'Loading items…',
    error: 'Something went wrong',
    empty: 'No items to show',
    available: 'Available',
    soldOut: 'Sold out',
    account: 'My account',
    balance: 'Balance',
  },
};

export function currentLang(search = location.search) {
  const lang = new URLSearchParams(search).get('lang');
  return lang === 'en' ? 'en' : 'ar';
}
