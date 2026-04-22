import './globals.css';

export const metadata = {
  title: 'Taskboard',
  description: 'Матрица задач: важно/срочно',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
