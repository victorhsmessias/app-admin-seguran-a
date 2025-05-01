import React, { useState, useEffect, useRef } from 'react';
import { getAvatarUrl, getThumbnailUrl, getModalViewUrl } from '../utils/imageUtils';
import { getCurrentUser, logout } from '../services/authService';
import { getAllSecurityGuards, createSecurityGuard, updateSecurityGuard, deleteSecurityGuard } from '../services/securityService';
import { getRealtimeCheckIns, getCheckInsByDateRange, getCheckInStats } from '../services/checkInService';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';

const AdminDashboard = ({ user, onLogout }) => {
  // Estados para controle da interface
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [securityGuards, setSecurityGuards] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [stats, setStats] = useState({
    totalGuards: 0,
    activeGuards: 0,
    checkInsToday: 0
  });

  // Estado para o formulário
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    role: 'security'
  });
  const [formPassword, setFormPassword] = useState('');
  const [error, setError] = useState(null);
  
  // Estado para relatórios
  const [reportFilter, setReportFilter] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    securityId: '',
  });
  const [reportData, setReportData] = useState([]);
  
  // Estado para controlar o modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' ou 'edit'
  
  // Refs para cancelar listeners
  const guardsListenerRef = useRef(null);
  const checkInsListenerRef = useRef(null);

  const handleLogoutClick = async () => {
    navigate('/login');
    await onLogout();
  };

  // Carregar dados ao montar o componente
useEffect(() => {
  // Importar auth do Firebase
  const { auth } = require('../firebase');
  
  // Função para carregar dados
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
        activeGuards: guardsResult.data.filter(guard => guard.role === 'security').length,
        checkInsToday: statsData.todayCount
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setError('Falha ao carregar os dados. Verifique suas conexão e permissões.');
      setLoading(false);
    }
  };
  
  // Verificar se o usuário já está autenticado
  if (auth.currentUser) {
    loadData();
  } else {
    // Configurar um ouvinte para quando a autenticação mudar
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadData();
      } else {
        setLoading(false);
      }
    });
    
    // Certifique-se de cancelar o ouvinte ao desmontar
    return () => {
      unsubscribe();
      if (guardsListenerRef.current) {
        guardsListenerRef.current();
      }
      if (checkInsListenerRef.current) {
        checkInsListenerRef.current();
      }
    };
  }
}, []);

  // Função para carregar todos os dados necessários
  const loadDashboardData = async () => {
    setLoading(true);
    try {
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
        activeGuards: guardsResult.data.filter(guard => guard.role === 'security').length,
        checkInsToday: statsData.todayCount
      });

      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setError('Falha ao carregar os dados. Verifique sua conexão.');
      setLoading(false);
    }
  };
  
  // Função para formatar data e hora
  const formatDateTime = (timestamp) => {
    // Verifica se timestamp é um objeto Date, string ISO ou timestamp numérico
    let date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (timestamp && timestamp.seconds) {
      // Firestore Timestamp
      date = new Date(timestamp.seconds * 1000);
    } else {
      return 'Data inválida';
    }
    
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Funções para gestão do modal
  const handleOpenCreateModal = () => {
    setFormData({
      username: '',
      email: '',
      phone: '',
      role: 'security'
    });
    setFormPassword('');
    setError(null);
    setModalMode('create');
    setShowModal(true);
  };
  
  const handleOpenEditModal = (guard) => {
    setFormData({
      id: guard.id,
      username: guard.username,
      email: guard.email,
      phone: guard.phone,
      role: guard.role || 'security'
    });
    setFormPassword('');
    setError(null);
    setModalMode('edit');
    setShowModal(true);
  };
  
  const handleCloseModal = () => {
    setShowModal(false);
  };
  
  // Função para lidar com mudanças no formulário
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  // Função para enviar o formulário
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      if (modalMode === 'create') {
        // Validar senha para novos usuários
        if (!formPassword || formPassword.length < 6) {
          throw new Error("A senha deve ter pelo menos 6 caracteres");
        }
        
        // Criar novo segurança
        await createSecurityGuard(formData, formPassword);
      } else {
        // Atualizar segurança existente
        await updateSecurityGuard(formData.id, formData);
      }
      
      // Recarregar lista após sucesso
      await loadDashboardData();
      setShowModal(false);
    } catch (err) {
      console.error("Erro ao salvar funcionário:", err);
      setError(err.message || "Ocorreu um erro ao salvar o funcionário.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Função para excluir um segurança
  const handleDeleteGuard = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este funcionário?')) {
      return;
    }
    
    try {
      await deleteSecurityGuard(id);
      // Atualizar a lista após excluir
      const updatedGuards = securityGuards.filter(guard => guard.id !== id);
      setSecurityGuards(updatedGuards);
    } catch (error) {
      console.error('Erro ao excluir segurança:', error);
      alert('Ocorreu um erro ao excluir o funcionário.');
    }
  };
  
  // Função para lidar com mudanças nos filtros de relatório
  const handleReportFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilter({
      ...reportFilter,
      [name]: value
    });
  };
  
  // Função para gerar relatório
  const handleGenerateReport = async () => {
    if (!reportFilter.startDate || !reportFilter.endDate) {
      alert('Por favor, selecione as datas inicial e final.');
      return;
    }

    setIsGeneratingReport(true);

    try {
      // Buscar check-ins pelo intervalo de datas e usuário (se especificado)
      const checkIns = await getCheckInsByDateRange(
        reportFilter.startDate, 
        reportFilter.endDate,
        reportFilter.securityId || null
      );
      
      setReportData(checkIns);
      
      if (checkIns.length === 0) {
        alert('Nenhum registro encontrado para os filtros selecionados.');
      }
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      alert(`Erro ao gerar o relatório: ${error.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Função para exportar relatório como CSV
  const handleExportCSV = () => {
    if (reportData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }
    
    // Criar conteúdo CSV
    const headers = ['ID', 'Usuário', 'Data/Hora', 'Latitude', 'Longitude', 'Precisão', 'Dispositivo'];
    
    const csvContent = [
      headers.join(','),
      ...reportData.map(item => [
        item.id,
        item.username || 'N/A',
        formatDateTime(item.timestamp),
        item.location.latitude,
        item.location.longitude,
        item.location.accuracy,
        item.deviceInfo ? `"${item.deviceInfo.replace(/"/g, '""')}"` : 'N/A'
      ].join(','))
    ].join('\n');
    
    // Criar blob e link de download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_${reportFilter.startDate}_${reportFilter.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSX para a aba de visão geral (overview)
  const renderOverview = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-20">
          <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      );
    }

    return (
      <div>
        {/* Cartões de estatísticas */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total de Seguranças</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.totalGuards}</dd>
              </dl>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Seguranças Ativos</dt>
                <dd className="mt-1 text-3xl font-semibold text-green-600">{stats.activeGuards}</dd>
              </dl>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Check-ins Hoje</dt>
                <dd className="mt-1 text-3xl font-semibold text-blue-600">{stats.checkInsToday}</dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Tabela de check-ins recentes */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Últimos Check-ins</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Segurança
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data/Hora
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Localização
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dispositivo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {checkIns.length > 0 ? (
                  checkIns.map((checkIn) => (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <img 
                              className="h-10 w-10 rounded-full object-cover cursor-pointer" 
                              src={checkIn.photoUrl || 'https://via.placeholder.com/150'} 
                              alt={checkIn.user?.username || 'Segurança'}
                              onClick={() => setSelectedImage(checkIn.photoUrl)}
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'https://via.placeholder.com/150';
                              }}
                            />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {checkIn.user?.username || 'Segurança'}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {checkIn.userId.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(checkIn.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <a 
                          href={`https://www.google.com/maps?q=${checkIn.location.latitude},${checkIn.location.longitude}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Ver no mapa
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {checkIn.deviceInfo ? (
                          checkIn.deviceInfo.substring(0, 30) + '...'
                        ) : (
                          'Dispositivo desconhecido'
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                      Nenhum check-in registrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // JSX para a aba de funcionários
  const renderEmployees = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-20">
          <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      );
    }

    return (
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6 flex justify-between items-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Gerenciar Funcionários</h3>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Adicionar Funcionário
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Funcionário
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contato
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Função
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {securityGuards.length > 0 ? (
                securityGuards.map((guard) => (
                  <tr key={guard.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{guard.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{guard.email}</div>
                      <div className="text-sm text-gray-500">{guard.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        guard.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {guard.role === 'admin' ? 'Administrador' : 'Segurança'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleOpenEditModal(guard)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteGuard(guard.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum funcionário cadastrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // JSX para a aba de relatórios
  const renderReports = () => {
    return (
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Gerar Relatórios</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Inicial
              </label>
              <input
                type="date"
                name="startDate"
                value={reportFilter.startDate}
                onChange={handleReportFilterChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Final
              </label>
              <input
                type="date"
                name="endDate"
                value={reportFilter.endDate}
                onChange={handleReportFilterChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Funcionário
              </label>
              <select
                name="securityId"
                value={reportFilter.securityId}
                onChange={handleReportFilterChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              >
                <option value="">Escolher funcionário</option>
                {securityGuards
                  .filter(guard => guard.role === 'security')
                  .map(guard => (
                    <option key={guard.id} value={guard.id}>
                      {guard.username}
                    </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {isGeneratingReport ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Gerando...
                </>
              ) : (
                "Gerar Relatório"
              )}
            </button>
            
            {reportData.length > 0 && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Exportar CSV
              </button>
            )}
          </div>

          {reportData.length > 0 && (
            <div className="mt-8 border-t border-gray-200 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-md font-medium text-gray-700">Resultados do Relatório</h4>
                <span className="text-sm text-gray-500">
                  {reportData.length} check-ins encontrados
                </span>
              </div>
              
              <div className="overflow-x-auto bg-gray-50 rounded-lg p-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Foto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funcionário</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data/Hora</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coordenadas</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <img 
                            src={item.photoUrl ? getThumbnailUrl(item.photoUrl) : 'https://via.placeholder.com/150'} 
                            alt="Check-in" 
                            className="h-16 w-16 rounded-md object-cover cursor-pointer"
                            onClick={() => setSelectedImage(item.photoUrl)}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://via.placeholder.com/150';
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.username || 'Não identificado'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateTime(item.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <a 
                            href={`https://www.google.com/maps?q=${item.location.latitude},${item.location.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {item.address || `${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}`}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.deviceInfo ? item.deviceInfo.substring(0, 20) + '...' : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Cabeçalho */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Sistema de Monitoramento</h1>
          <div className="flex items-center">
            <span className="mr-4 text-sm text-gray-600">Olá, {user.username}</span>
            <button
              onClick={handleLogoutClick}
              className="bg-red-600 hover:bg-red-700 text-white text-sm py-1 px-3 rounded transition duration-150"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Navegação por abas */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-6 text-sm font-medium ${
                activeTab === 'overview'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300'
              }`}
            >
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`py-4 px-6 text-sm font-medium ${
                activeTab === 'employees'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300'
              }`}
            >
              Funcionários
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`py-4 px-6 text-sm font-medium ${
                activeTab === 'reports'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300'
              }`}
            >
              Relatórios
            </button>
          </nav>
        </div>

        {/* Conteúdo da aba selecionada */}
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'employees' && renderEmployees()}
        {activeTab === 'reports' && renderReports()}
      </main>

      {/* Modal para adicionar/editar funcionário */}
      {showModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleSubmitForm}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      {modalMode === 'create' ? 'Adicionar Funcionário' : 'Editar Funcionário'}
                    </h3>
                    
                    {error && (
                      <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Nome de Usuário</label>
                        <input
                          type="text"
                          name="username"
                          value={formData.username}
                          onChange={handleFormChange}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleFormChange}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                          disabled={modalMode === 'edit'}
                          title={modalMode === 'edit' ? "O email não pode ser alterado" : ""}
                        />
                      </div>
                      
                      {modalMode === 'create' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Senha</label>
                          <input
                            type="password"
                            name="password"
                            value={formPassword}
                            onChange={(e) => setFormPassword(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            required
                            minLength="6"
                          />
                        </div>
                      )}
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Telefone</label>
                        <input
                          type="text"
                          name="phone"
                          value={formData.phone}
                          onChange={handleFormChange}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Função</label>
                        <select
                          name="role"
                          value={formData.role}
                          onChange={handleFormChange}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="security">Segurança</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    {isSubmitting ? 'Salvando...' : modalMode === 'create' ? 'Adicionar' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={handleCloseModal}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal para visualizar imagem em tamanho maior */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" 
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className="max-w-3xl max-h-3xl p-2 bg-white rounded-lg" 
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={selectedImage ? getModalViewUrl(selectedImage) : ''}
              alt="Imagem em detalhes" 
              className="max-h-[80vh] max-w-full" 
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://via.placeholder.com/800x600?text=Imagem+não+disponível';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;