import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <img src="/logo.svg" alt="Taskboard" width="64" height="64" className="mx-auto mb-4" />
        <h1 className="text-4xl font-semibold text-gray-900 mb-3">Taskboard</h1>
        <p className="text-gray-600 mb-8">
          Матрица задач по приоритетам. Личные доски и общие комнаты с друзьями.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-100 text-sm font-medium"
          >
            Войти
          </Link>
          <Link
            href="/signup"
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
          >
            Регистрация
          </Link>
        </div>
      </div>
    </div>
  );
}
