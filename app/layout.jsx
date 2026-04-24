import './globals.css';

export const metadata = {
  title: 'Taskboard',
  description: 'Матрица задач: важно/срочно',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }]
  }
};

// Applied before hydration to prevent a light→dark flash on cold page loads.
// Must be plain ES5 and self-contained because it runs before any bundle.
const THEME_BOOT_SCRIPT = `
try {
  var t = window.localStorage.getItem('theme');
  if (t === 'dark' || t === 'cosmic' || t === 'light' || t === 'parchment') {
    document.documentElement.setAttribute('data-theme', t);
  }
} catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
