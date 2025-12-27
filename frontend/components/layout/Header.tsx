'use client';

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-6 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Admin Panel</h2>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">Hello, Admin</p>
            <p className="text-xs text-gray-500">Welcome back</p>
          </div>
        </div>
      </div>
    </header>
  );
}

