import React, { useState, useEffect, useRef } from 'react';
import { getThumbnailUrl, getAvatarUrl, getModalViewUrl } from './utils/imageUtils';
import { loginWithEmailAndPassword, getUserRole } from './services/authService';
import { getCurrentUser, logout } from './services/authService';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import { getAllSecurityGuards } from './services/securityService';
import { getRealtimeCheckIns, getCheckInStats } from './services/checkInService';
import AdminDashboard from './components/AdminDashboard';
// Componente de Login para o Painel Administrativo
const AdminLogin = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
  
    try {
      const user = await loginWithEmailAndPassword(username, password);
      
      // Verificar se temos informações do usuário
      if (!user) {
        setError('Falha na autenticação. Nenhuma informação de usuário retornada.');
        setLoading(false);
        return;
      }
      
      const userRole = await getUserRole(user.uid);
  
      if (userRole !== 'admin') {
        setError('Acesso não autorizado. Este aplicativo é apenas para a administração.');
        setLoading(false);
        return;
      }else{
        // Se chegou aqui, o login foi bem-sucedido
        onLogin({ username, role: 'admin' });
      }
      
    } catch (error) {      
      // Tratamento específico para diferentes tipos de erro do Firebase
      if (error.code === 'auth/invalid-credential') {
        setError('Email ou senha incorretos. Verifique suas credenciais.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Email inválido. Verifique seu email.');
      } else if (error.code === 'auth/user-not-found') {
        setError('Usuário não encontrado.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Senha incorreta.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Tente novamente mais tarde.');
      } else if (error.code === 'auth/user-disabled') {
        setError('Esta conta foi desativada.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Erro de conexão. Verifique sua internet.');
      } else if (error.code) {
        // Para outros códigos de erro do Firebase
        setError(`Erro ao fazer login: ${error.code}`);
      } else {
        // Para erros não reconhecidos
        setError('Ocorreu um erro inesperado ao fazer login. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo e Título */}
        <div className="text-center mb-8">
          <div className="inline-block bg-blue-600 text-white p-3 rounded-lg mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Sistema de Monitoramento</h1>
          <p className="text-gray-600 mt-2">Painel Administrativo</p>
        </div>

        {/* Formulário de Login */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            {error && (
              <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
                <p>{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
                  Nome de Usuário
                </label>
                <input
                  className="appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500"
                  id="username"
                  type="text"
                  placeholder="Digite seu usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                  Senha
                </label>
                <input
                  className="appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-blue-500"
                  id="password"
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end mb-6">
                <div className="text-sm">
                  <a href="#" className="text-blue-600 hover:text-blue-800">
                    Esqueceu a senha?
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Entrando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Rodapé */}
        <div className="text-center mt-6 text-sm text-gray-500">
          &copy; 2025 Sistema de Monitoramento de Segurança. Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
};

// Componente principal que integra login e dashboard
const AdminApp = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [securityGuards, setSecurityGuards] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [stats, setStats] = useState({});

  const guardsListenerRef = useRef(null);
  const checkInsListenerRef = useRef(null);

  // Carregar dados ao montar o componente
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Buscar seguranças
        const guardsResult = await getAllSecurityGuards();
        setSecurityGuards(guardsResult.data);
        guardsListenerRef.current = guardsResult.unsubscribe;
        
        // Buscar check-ins em tempo real
        const checkInsResult = await getRealtimeCheckIns(20);
        setCheckIns(checkInsResult.data);
        checkInsListenerRef.current = checkInsResult.unsubscribe;
        
        // Buscar estatísticas
        const statsData = await getCheckInStats();
        setStats({
          totalGuards: guardsResult.data.length,
          activeGuards: guardsResult.data.filter(guard => guard.status === 'Ativo').length,
          checkInsToday: statsData.todayCount
        });

        setLoading(false);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        setLoading(false);
      }
    };
    
    loadData();

    // Limpar listeners ao desmontar
    return () => {
      if (guardsListenerRef.current) {
        guardsListenerRef.current();
      }
      if (checkInsListenerRef.current) {
        checkInsListenerRef.current();
      }
    };
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          !user 
            ? <AdminLogin onLogin={handleLogin} /> 
            : <Navigate to="/dashboard" replace />
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          user ? (
            <PrivateRoute>
              <AdminDashboard 
                user={user} 
                onLogout={handleLogout} 
                loading={loading}
                securityGuards={securityGuards}
                checkIns={checkIns}
                stats={stats}
              />
            </PrivateRoute>
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};


export default AdminApp;