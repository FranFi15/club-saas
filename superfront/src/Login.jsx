import { useState } from 'react';
import api from '../src/utils/api.js';

export default function Login({ setToken }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('http://localhost:4000/api/admin/login', { email, password });
      localStorage.setItem('adminToken', data.token);
      setToken(data.token);
    } catch (error) {
      alert('Error en login: Credenciales inválidas');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <form onSubmit={handleLogin} className="p-8 bg-white rounded-lg shadow-xl w-96">
        <h2 className="mb-6 text-2xl font-bold text-center text-gray-800">Super Admin SaaS</h2>
        <input 
          type="email" placeholder="Email" required
          className="w-full p-3 mb-4 border rounded"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input 
          type="password" placeholder="Contraseña" required
          className="w-full p-3 mb-6 border rounded"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="w-full p-3 text-white bg-indigo-600 rounded hover:bg-indigo-700">
          Ingresar
        </button>
      </form>
    </div>
  );
}