// src/components/AdminLogin.js - trecho corrigido
import { loginWithEmailAndPassword } from '../services/authService';

const handleLogin = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    // Usando a função correta do authService
    const user = await loginWithEmailAndPassword(username, password);
    
    // Se chegou aqui, o login foi bem-sucedido
    onLogin({ 
      username: user.email, 
      role: 'admin',
      uid: user.uid 
    });
    navigate('/dashboard');
  } catch (error) {
    console.error('Erro de login:', error);
    
    // Tratamento de erro mais específico
    if (error.code === 'auth/invalid-credential') {
      setError('Email ou senha incorretos. Verifique suas credenciais.');
    } else if (error.code === 'auth/user-not-found') {
      setError('Usuário não encontrado.');
    } else if (error.code === 'auth/wrong-password') {
      setError('Senha incorreta.');
    } else {
      setError('Erro ao fazer login. Verifique suas credenciais.');
    }
  } finally {
    setLoading(false);
  }
};