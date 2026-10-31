import React from 'react';
import {
  BookOpen,
  Printer,
  ShieldCheck,
  Award,
  Layers,
  Cpu,
  Smartphone,
  WifiOff,
  Mic,
  Compass,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Clock,
  Sparkles,
  MapPin,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { Language, getT } from '../i18n';

interface KermanManualViewProps {
  lang: Language;
}

export const KermanManualView: React.FC<KermanManualViewProps> = ({ lang }) => {
  const t = getT(lang);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8 font-sans [dir=rtl] text-right" dir="rtl">
      {/* Top Action Bar (hidden when printing) */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              دستورالعمل جامع و نظام‌نامه اجرایی شهرداری کرمان
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-400" />
            <span>دستورالعمل راهنمای جامع کاربران و آمارگیران ترافیک شهرداری کرمان</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            طراحی، معماری فناوری‌ها، بهترین تمرین‌ها (Best Practices) و راهنمای عملیاتی برداشت میدانی
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>چاپ جزوه رسمی / ذخیره PDF</span>
          </button>
        </div>
      </div>

      {/* Main Document Sheet (Printable A4 format with white background & professional typography) */}
      <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-14 shadow-2xl border border-slate-200 space-y-10 font-vazir text-right print:p-0 print:border-none print:shadow-none" dir="rtl">
        {/* Official Header with Triple Logos */}
        <div className="border-b-4 border-slate-900 pb-8 space-y-6">
          {/* Triple Emblems Row */}
          <div className="flex items-center justify-between gap-4">
            {/* Logo 1: شهرداری کرمان */}
            <div className="flex flex-col items-center text-center w-36">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center p-2 shadow-md border-2 border-amber-500/30">
                <svg viewBox="0 0 100 100" className="w-full h-full fill-current">
                  {/* Stylized Historical Kerman Windcatcher & City Gate Motif */}
                  <rect x="25" y="45" width="50" height="45" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="4" />
                  <path d="M 20 45 L 50 15 L 80 45 Z" fill="#f59e0b" />
                  <line x1="35" y1="55" x2="35" y2="75" stroke="#f59e0b" strokeWidth="3" />
                  <line x1="50" y1="55" x2="50" y2="75" stroke="#f59e0b" strokeWidth="3" />
                  <line x1="65" y1="55" x2="65" y2="75" stroke="#f59e0b" strokeWidth="3" />
                  <circle cx="50" cy="32" r="5" fill="#0f172a" />
                </svg>
              </div>
              <span className="text-[11px] font-black text-slate-900 mt-2">شهرداری کرمان</span>
              <span className="text-[9px] text-slate-500 font-medium">مدیریت شهری کهن‌شهر</span>
            </div>

            {/* Official Title Centerpiece */}
            <div className="flex-1 text-center space-y-1 px-4">
              <p className="text-xs font-bold text-slate-600 tracking-wider">جمهوری اسلامی ایران</p>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                معاونت حمل و نقل و امور زیربنایی شهرداری کرمان
              </h1>
              <h2 className="text-sm sm:text-base font-extrabold text-teal-800">
                سازمان مدیریت حمل و نقل بار و مسافر شهرداری کرمان
              </h2>
              <div className="inline-block px-4 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold mt-2 border border-slate-300">
                دستورالعمل جامع و نظام‌نامه برداشت میدانی داده‌های ترافیک (پلتفرم TrafficLab)
              </div>
            </div>

            {/* Logo 2 & 3: معاونت و سازمان حمل و نقل */}
            <div className="flex flex-col items-center text-center w-36">
              <div className="w-16 h-16 rounded-2xl bg-teal-900 text-teal-300 flex items-center justify-center p-2 shadow-md border-2 border-teal-400">
                <svg viewBox="0 0 100 100" className="w-full h-full fill-current">
                  {/* Transportation & Traffic Dynamic Intersection Movement Logo */}
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#2dd4bf" strokeWidth="5" />
                  <path d="M 50 15 L 50 85 M 15 50 L 85 50" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" />
                  <polygon points="50,10 44,22 56,22" fill="#2dd4bf" />
                  <polygon points="50,90 44,78 56,78" fill="#2dd4bf" />
                  <polygon points="90,50 78,44 78,56" fill="#2dd4bf" />
                  <polygon points="10,50 22,44 22,56" fill="#2dd4bf" />
                  <circle cx="50" cy="50" r="14" fill="#0f172a" stroke="#2dd4bf" strokeWidth="3" />
                </svg>
              </div>
              <span className="text-[11px] font-black text-slate-900 mt-2">معاونت حمل و نقل و ترافیک</span>
              <span className="text-[9px] text-slate-500 font-medium">سازمان مدیریت حمل و نقل</span>
            </div>
          </div>

          {/* Document Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
            <span><strong>شماره سند:</strong> KM-TRF-STD-2026-01</span>
            <span><strong>کد طرح:</strong> پایش دروازه‌ای محدوده مرکزی و شریان‌های شهر کرمان</span>
            <span><strong>نسخه:</strong> ۰.۲ (روش‌شناسی با الهام از راهنمای FHWA TMG؛ این سند گواهی انطباق با آن استاندارد نیست)</span>
          </div>
        </div>

        {/* Lead Designer & Planner Dedication Card */}
        <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 text-white shadow-xl relative overflow-hidden border-2 border-teal-500/40">
          <div className="absolute left-0 top-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mt-20"></div>

          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
            {/* Dr. Akram Mazaheri Portrait */}
            <div className="relative shrink-0">
              <div className="w-36 h-48 rounded-2xl overflow-hidden border-4 border-amber-400 shadow-2xl bg-slate-800">
                <img
                  src="/assets/akram_mazaheri.png"
                  alt="سرکار خانم دکتر اکرم مظاهری - طراح و برنامه‌ریز ارشد سامانه"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <span className="absolute inset-0 -z-0 flex items-center justify-center text-4xl font-black text-amber-300/70" aria-hidden>ا.م</span>
              </div>
              <div className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black shadow-md flex items-center gap-1">
                <Award className="w-3 h-3" />
                <span>طراح و برنامه‌ریز</span>
              </div>
            </div>

            {/* Biography & Vision */}
            <div className="space-y-3 text-center sm:text-right">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  معرفی معمار و مدیر علمی طرح
                </span>
                <h3 className="text-2xl font-black text-white mt-1">
                  سرکار خانم دکتر اکرم مظاهری
                </h3>
                <p className="text-sm text-teal-300 font-bold mt-0.5">
                  دکترای تخصصی برنامه‌ریزی حمل و نقل و سیستم‌های ترافیکی
                </p>
                <p className="text-xs text-slate-400 font-medium">
                  طراح و برنامه‌ریز سامانه هوشمند جمع‌آوری داده‌های ترافیک (TrafficLab) شهرداری کرمان
                </p>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed text-justify">
                «پلتفرم هوشمند <strong>TrafficLab</strong> حاصل تجربیات میدانی و مطالعات آکادمیک در مهندسی ترافیک و تحلیل ماتریس‌های مبدا-مقصد (Origin-Destination) است که متناسب با مختصات ترافیکی، اقلیمی و کالبدی کهن‌شهر کرمان معماری شده است. این سیستم با هدف حذف خطاهای انسانی در یادداشت‌های کاغذی، ارتقای سرعت ثبت به ۱ الی ۲ ثانیه و انطباق مکانی-زمانی دقیق خودروها بدون نیاز به ابزارهای پرهزینه، در اختیار پرسنل خدوم و کارشناسان معاونت حمل و نقل و ترافیک شهرداری کرمان قرار می‌گیرد.»
              </p>
            </div>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-700" />
            <span>فهرست فصول دستورالعمل اجرایی</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-700">
            <div className="p-2 bg-white rounded-lg border border-slate-200 font-semibold flex items-center justify-between">
              <span>فصل ۱: معماری فنی و فناوری‌های نوین به‌کار رفته در سامانه</span>
              <span className="font-mono text-slate-400">بخش ۱</span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200 font-semibold flex items-center justify-between">
              <span>فصل ۲: بهترین تمرین‌ها (Best Practices) در برداشت داده در کرمان</span>
              <span className="font-mono text-slate-400">بخش ۲</span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200 font-semibold flex items-center justify-between">
              <span>فصل ۳: راهنمای گام به گام عملیاتی برای ناظران و آمارگیران</span>
              <span className="font-mono text-slate-400">بخش ۳</span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200 font-semibold flex items-center justify-between">
              <span>فصل ۴: الگوریتم انطباق پلاک، محاسبات ریاضی و حل موارد مبهم</span>
              <span className="font-mono text-slate-400">بخش ۴</span>
            </div>
          </div>
        </div>

        {/* Section 1: Technologies & Architecture */}
        <div className="space-y-4">
          <div className="border-r-4 border-teal-600 pr-3">
            <h3 className="text-lg font-black text-slate-900">
              فصل اول: زیرساخت فنی و فناوری‌های به‌کار رفته در سامانه TrafficLab
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              آشنایی کارشناسان فاوا و ترافیک شهرداری با لایه‌های نرم‌افزاری و پروتکل‌های عملیاتی
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-700">
            {/* Tech 1 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>۱. رابط کاربری واکنش‌گرا و وب‌اپلیکیشن پیش‌رونده (PWA)</span>
              </div>
              <p className="text-justify text-[11px]">
                سمت کاربر با فریمورک <strong>React 19</strong> و زبان <strong>TypeScript</strong> و ابزار استایل‌دهی <strong>Tailwind CSS</strong> به صورت Mobile-First پیاده‌سازی شده است. این طراحی سبب می‌شود نرم‌افزار روی انواع گوشی‌های هوشمند آمارگیران بدون نیاز به نصب اپلیکیشن سنگین و صرفاً با مرورگر اجرا شود. فونت <strong>وزیرمتن (Vazirmatn)</strong> استاندارد خوانایی کامل متون فارسی را تضمین می‌کند.
              </p>
            </div>

            {/* Tech 2 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <WifiOff className="w-4 h-4 text-amber-600" />
                <span>۲. پایداری داده با صف محلی آفلاین (IndexedDB)</span>
              </div>
              <p className="text-justify text-[11px]">
                به منظور مقابله با قطعی‌های احتمالی اینترنت یا نقاط کور شبکه دیتا در سطح تقاطع‌های کرمان، مکانیزم ذخیره‌سازی محلی در پایگاه‌داده مرورگر (IndexedDB) تعبیه شده است. زمان دقیق رویت خودرو (Timestamp) در لحظه ثبت با دقت صدم ثانیه ذخیره شده و پس از بازگشت سیگنال، خودکار با سرور مرکزی همگام‌سازی می‌شود.
              </p>
            </div>

            {/* Tech 3 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Mic className="w-4 h-4 text-rose-600" />
                <span>۳. ورودی صوتی هوشمند ارقام فارسی (Web Speech API)</span>
              </div>
              <p className="text-justify text-[11px]">
                آمارگیر می‌تواند بدون فشردن کلید، ارقام انتهای پلاک را به فارسی بر زبان بیاورد (مانند «سه هشت هفت»). الگوریتم نرمال‌سازی بومی عبارات محاوره‌ای را به فرمت استاندارد رشته‌ای عددی <code className="bg-slate-200 px-1 rounded">387</code> تبدیل کرده و صفر اول پلاک‌ها (نظیر ۰۴۲) را نیز بدون مخدوش شدن حفظ می‌کند. این فرآیند بدون وابستگی به سرورهای خارجی اجرا می‌شود.
              </p>
            </div>

            {/* Tech 4 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>۴. موتور محاسباتی تحلیلی مستقل در پایتون (Python 3.10 Engine)</span>
              </div>
              <p className="text-justify text-[11px]">
                تمام محاسبات مهندسی حمل و نقل، انطباق مکانی-زمانی پلاک‌های ناقص (Partial License Plate Matching)، ساخت ماتریس مبدا-مقصد، و برازش صدک‌های آماری ($P_{15}, P_{50}, P_{85}, P_{95}$) در هسته مستقل پایتون اجرا می‌شوند و نتایج به‌صورت «سفرهای محتمل» گزارش می‌شوند؛ تطبیق ۳ رقم پلاک قطعی نیست.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Best Practices for Kerman City */}
        <div className="space-y-4">
          <div className="border-r-4 border-amber-500 pr-3">
            <h3 className="text-lg font-black text-slate-900">
              فصل دوم: راهنمای بهترین تمرین‌ها (Best Practices) در برداشت میدانی شهر کرمان
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              دستورالعمل ویژه شرایط اقلیمی و هندسه معابر شهر کرمان (میدان آزادی، بلوار جمهوری، میدان شهدا، بلوار صدوقی)
            </p>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-slate-700">
            {/* BP 1: Station Location & Safety */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
              <h4 className="font-extrabold text-amber-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>۱. استقرار ایمن آمارگیر و زاویه دید به پلاک خودروها</span>
              </h4>
              <p className="text-justify text-[11px]">
                آمارگیران باید در مکانی ایمن بر روی پیاده‌رو یا رفیوژ میانی با دید مناسب به لاین‌های حرکتی مستقر شوند. زاویه دید نباید کمتر از ۳۰ درجه نسبت به محور حرکت خودروها باشد تا خواندن ۳ رقم انتهای پلاک خودروهای متوالی امکان‌پذیر گردد. از ایستادن در لبه سواره‌رو اکیداً خودداری شود. استفاده از کلاه نقاب‌دار و جلیقه شبرنگ شهرداری الزامی است.
              </p>
            </div>

            {/* BP 2: Managing Platoons in Peak Hours */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>۲. مدیریت دسته‌های متراکم خودرو (Platoons) در ساعات اوج کرمان</span>
              </h4>
              <p className="text-justify text-[11px]">
                در ساعات اوج ترافیک صبحگاهی (۷:۳۰ الی ۸:۴۵) و عصرگاهی (۱۷:۳۰ الی ۲۰:۳۰) به ویژه در تقاطع‌های منتهی به میدان آزادی، چهارراه سمیه و بلوار شهید صدوقی، خودروها به صورت گروهی چراغ سبز را رد می‌کنند. در این حالت:
              </p>
              <ul className="list-disc list-inside space-y-1 pr-2 text-[11px]">
                <li>آمارگیر باید روی <strong>صفحه کلید سریع لمسی (Numpad)</strong> تمرکز کند که ثبت هر خودرو کمتر از ۱ ثانیه زمان می‌برد.</li>
                <li>دسته‌بندی خودرو را روی حالت پیش‌فرض (سواری شخصی) بگذارید و فقط در صورت مشاهده وانت، اتوبوس یا تاکسی روی کلید مربوطه ضربه بزنید.</li>
                <li>اگر دسته عبوری بیش از ظرفیت یک نفر بود، از آمارگیر پشتیبان برای شمارش خطوط مجاور استفاده نمایید.</li>
              </ul>
            </div>

            {/* BP 3: Sun Glare & Battery Management */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>۳. مدیریت تابش آفتاب کویری و شارژ باتری تلفن همراه</span>
              </h4>
              <p className="text-justify text-[11px]">
                به دلیل شدت تابش آفتاب در شهر کرمان، پوسته‌ی نرم‌افزار به صورت <strong>High-Contrast با پس‌زمینه تیره (Dark Slate)</strong> طراحی شده است تا تابش خیره‌کننده نور مانع دیدن صفحه نشود. توصیه می‌شود روشنایی گوشی را روی حداکثر تنظیم کرده و حتماً هر آمارگیر یک پاوربانک به همراه داشته باشد. حالت صرفه‌جویی باتری (Battery Saver) را غیرفعال کنید تا فرآیند ثبت زمان در پس‌زمینه کند نشود.
              </p>
            </div>

            {/* BP 4: Zero Preservation & Voice Input Best Practice */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>۴. ثبت پلاک‌های دارای صفر اولیه و کاربرد بهینه ورودی صوتی</span>
              </h4>
              <p className="text-justify text-[11px]">
                پلاک‌هایی نظیر <span className="font-mono font-bold text-teal-800">۰۴۲</span> یا <span className="font-mono font-bold text-teal-800">۰۰۹</span> دارای صفر بااهمیت هستند. هرگز صفر را حذف نکنید؛ سیستم به صورت خودکار ارقام وارد شده را ۳ رقمی پد می‌کند. ورودی صوتی فارسی در ساعات خلوت‌تر (۱۰ صبح الی ۱۲ ظهر) که نویز ترافیک کمتر است بالاترین بازدهی را دارد، اما در شلوغی تقاطع‌ها کیپد لمسی سرعت بالاتری دارد.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Step-by-Step User Guide */}
        <div className="space-y-4">
          <div className="border-r-4 border-indigo-600 pr-3">
            <h3 className="text-lg font-black text-slate-900">
              فصل سوم: راهنمای گام به گام کاربری سامانه TrafficLab
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              وظایف مدیر طرح، سوپروایزر میدانی و آمارگیران دروازه‌ای
            </p>
          </div>

          <div className="space-y-4 text-xs leading-relaxed">
            {/* Step 1 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">۱</span>
                <h4 className="font-bold text-slate-900">گام اول: پیکربندی طرح و نقشه شماتیک محدوده (توسط مدیر سیستم)</h4>
              </div>
              <p className="text-justify text-slate-700 text-[11px] pr-8">
                مدیر یا سوپروایزر وارد زبانه <strong>«نقشه شماتیک محدوده»</strong> شده و دروازه‌های ورودی محدوده تحت مطالعه را با کد <span className="font-mono font-bold text-emerald-600">E01</span>، <span className="font-mono font-bold text-emerald-600">E02</span> و دروازه‌های خروجی را با کد <span className="font-mono font-bold text-indigo-600">X01</span>، <span className="font-mono font-bold text-indigo-600">X02</span> جانمایی می‌کند. سپس در جدول پایین صفحه، فاصله مسیر بین هر ورودی و خروجی را بر حسب <strong>متر</strong> ثبت و ذخیره می‌نماید.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">۲</span>
                <h4 className="font-bold text-slate-900">گام دوم: ورود آمارگیر و قفل ایستگاه اختصاصی</h4>
              </div>
              <p className="text-justify text-slate-700 text-[11px] pr-8">
                هر آمارگیر با حساب کاربری خود وارد می‌شود (یا در منوی کاربری نقش خود را انتخاب می‌کند). در صفحه <strong>«ثبت میدانی پلاک»</strong>، بنر بالای صفحه با رنگ سبز یا آبی نشان می‌دهد آمارگیر در کدام ایستگاه مستقر است (مثلاً: <span className="font-mono font-bold">E01 - ورودی شمالی</span>). آمارگیر به هیچ عنوان نمی‌تواند اشتباهاً برای ایستگاه دیگری دیتا بزند.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">۳</span>
                <h4 className="font-bold text-slate-900">گام سوم: ثبت آنی خودرو و فیدبک لمسی</h4>
              </div>
              <p className="text-justify text-slate-700 text-[11px] pr-8">
                با عبور خودرو، آمارگیر ۳ رقم پلاک (مانند ۳۸۷) را لمس کرده و کلید سبز <strong>«ثبت خودرو»</strong> را می‌زند. رکورد در کسر ثانیه با زمان میلی‌ثانیه‌ای در حافظه ذخیره و فیدبک سبز رنگ داده می‌شود و فیلد برای خودروی بعدی خالی می‌گردد. در صورت عدم وجود اینترنت، دکمه زرد رنگ آفلاین شده و رکوردها به صف محلی فرستاده می‌شوند.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">۴</span>
                <h4 className="font-bold text-slate-900">گام چهارم: اجرای موتور انطباق و بررسی موارد مبهم (توسط سوپروایزر)</h4>
              </div>
              <p className="text-justify text-slate-700 text-[11px] pr-8">
                سوپروایزر در زبانه <strong>«همترازسازی خودروها»</strong> فیلتر حداقل و حداکثر زمان سفر مجاز (مثلاً ۳۰ الی ۹۰۰ ثانیه) را تنظیم و موتور پایتون را اجرا می‌کند. سفرهای قطعی با درصد اطمینان بالا ثبت شده و در صورت رویت دو پلاک مشابه در یک بازه، سیستم آن را در بخش <strong>«موارد مبهم نیازمند تایید»</strong> قرار می‌دهد تا ناظر گزینه منطقی‌تر را تایید کند.
              </p>
            </div>

            {/* Step 5 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">۵</span>
                <h4 className="font-bold text-slate-900">گام پنجم: مشاهده ماتریس مبدا-مقصد، تحلیل صدک‌ها و خروجی اکسل</h4>
              </div>
              <p className="text-justify text-slate-700 text-[11px] pr-8">
                در زبانه <strong>«ماتریس مبدا-مقصد و زمان سفر»</strong>، جدول حجم ترافیک بین هر ورودی و خروجی با درصد سهم جریان نمایش داده می‌شود. همچنین آماره‌های میانگین زمان سفر، میانه، صدک ۸۵ام (سرعت طرح معبر) و نمودار هیستوگرام آماده بهره‌برداری است. در انتها با کلیک روی دریافت اکسل یا گزارش رسمی، فایل‌های مستند برای معاونت حمل و نقل تولید می‌گردد.
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Engineering Calculations & Formulas */}
        <div className="space-y-4">
          <div className="border-r-4 border-emerald-600 pr-3">
            <h3 className="text-lg font-black text-slate-900">
              فصل چهارم: فرمول‌های مهندسی ترافیک و معیارهای کیفیت داده
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              مبانی ریاضی روش (نیازمند بازبینی و تأیید علمی طراح سامانه، مرجع کلی: FHWA TMG)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-800">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 font-mono">
              <p className="font-bold text-slate-900 font-sans">۱. محاسبه زمان سفر و فیلتر پنجره مجاز:</p>
              <div className="bg-slate-900 text-teal-300 p-3 rounded-xl text-center text-sm font-bold">
                Δt = t_exit - t_entry
              </div>
              <p className="text-[11px] text-slate-600 font-sans">
                شرط اعتبار سفر: <span className="font-mono text-teal-800 font-bold">T_min ≤ Δt ≤ T_max</span>. رکوردهایی که زمان سفر منفی یا کمتر از ۳۰ ثانیه (سرعت غیرمجاز مافوق صوت) دارند حذف می‌شوند.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 font-mono">
              <p className="font-bold text-slate-900 font-sans">۲. محاسبه سرعت متوسط سیر مسیر (Journey Speed):</p>
              <div className="bg-slate-900 text-emerald-300 p-3 rounded-xl text-center text-sm font-bold">
                V (km/h) = ( Distance_meters / Δt ) × 3.6
              </div>
              <p className="text-[11px] text-slate-600 font-sans">
                سرعت سیر شامل تمام تاخیرهای چراغ راهنمایی و صف تقاطع‌هاست و با سرعت لحظه‌ای رادار متفاوت است.
              </p>
            </div>
          </div>
        </div>

        {/* Official Signoff Box */}
        <div className="pt-8 border-t-2 border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-700">
          <div className="space-y-1 text-center sm:text-right">
            <p className="font-extrabold text-slate-900 text-sm">
              معاونت حمل و نقل و امور زیربنایی شهرداری کرمان
            </p>
            <p className="text-slate-600 text-[11px]">
              سازمان مدیریت حمل و نقل بار و مسافر • کارگروه مطالعات جامع حمل و نقل
            </p>
          </div>

          <div className="text-center sm:text-left space-y-1">
            <p className="font-extrabold text-slate-900 text-sm">
              سرکار خانم دکتر اکرم مظاهری
            </p>
            <p className="text-teal-700 font-bold text-[11px]">
              دکترای تخصصی برنامه‌ریزی حمل و نقل - طراح و برنامه‌ریز ارشد
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
