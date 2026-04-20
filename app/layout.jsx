import './globals.css';

export const metadata = {
  title: 'Taskboard',
  description: 'Матрица задач: важно/срочно'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
