import React, { useState, useEffect, useRef } from 'react';
import { getAvatarUrl, getThumbnailUrl, getModalViewUrl } from '../utils/imageUtils';
import { getCurrentUser, logout } from '../services/authService';
import { getAllSecurityGuards, createSecurityGuard, updateSecurityGuard, deleteSecurityGuard } from '../services/securityService';
import { getRealtimeCheckIns, getCheckInsByDateRange, getCheckInStats } from '../services/checkInService';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { getDoc, doc, collection, query, where, getDocs } from 'firebase/firestore';

// Mapeamento de funções para exibição em português
const roleMappings = {
  'admin': { text: 'Administrador', bgColor: 'bg-purple-100', textColor: 'text-purple-800' },
  'security': { text: 'Segurança', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  'vigia': { text: 'Vigia', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  'porteiro': { text: 'Porteiro', bgColor: 'bg-indigo-100', textColor: 'text-indigo-800' },
  'zelador': { text: 'Zelador', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
  'rh': { text: 'RH', bgColor: 'bg-pink-100', textColor: 'text-pink-800' },
  'supervisor': { text: 'Supervisor', bgColor: 'bg-orange-100', textColor: 'text-orange-800' },
  'sdf': { text: 'SDF', bgColor: 'bg-teal-100', textColor: 'text-teal-800' }
};

// Função auxiliar para verificar se o funcionário é operacional (não admin)
const isOperationalRole = (role) => {
  return role !== 'admin' && role !== 'rh';
};

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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [pendingFormData, setPendingFormData] = useState(null);
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

  // Adicione após as definições de estado e useRef
  const checkAdminStatus = async () => {
    if (!auth.currentUser) {
      console.error("Usuário não autenticado");
      return false;
    }
    
    try {
      const adminDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      return adminDoc.exists() && adminDoc.data().role === 'admin';
    } catch (error) {
      console.error("Erro ao verificar status de admin:", error);
      return false;
    }
  };

  const handleLogoutClick = async () => {
    navigate('/login');
    await onLogout();
  };

  // Carregar dados ao montar o componente
  useEffect(() => {  
      
    // Verificar se o usuário já está autenticado
    if (auth.currentUser) {
      loadDashboardData();
    } else {
      // Configurar um ouvinte para quando a autenticação mudar
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          loadDashboardData();
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
      
      // Buscar estatísticas - agora contando todas as funções operacionais
      const statsData = await getCheckInStats();
      setStats({
        totalGuards: guardsResult.data.length,
        activeGuards: guardsResult.data.filter(guard => isOperationalRole(guard.role)).length,
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
  
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Verificação de admin
      const isAdmin = await checkAdminStatus();
      if (!isAdmin) {
        throw new Error("Você não tem permissões de administrador para esta operação");
      }
      
      if (modalMode === 'create') {
        // Em vez de usar prompt, guardamos os dados do formulário e
        // exibimos o modal de senha
        setPendingFormData({...formData});
        setShowPasswordModal(true);
        setIsSubmitting(false); // Não está enviando ainda
        return; // Interrompe a execução até que o modal seja confirmado
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
  
  const handlePasswordConfirm = async () => {
    setIsSubmitting(true);
    try {
      await createSecurityGuard(
        pendingFormData, 
        formPassword,
        auth.currentUser.email,
        adminPasswordInput
      );
      
      // Limpar dados e fechar modais
      setAdminPasswordInput('');
      setShowPasswordModal(false);
      setShowModal(false);
      
      // Recarregar lista
      await loadDashboardData();
    } catch (err) {
      console.error("Erro ao criar funcionário:", err);
      setError(err.message || "Ocorreu um erro ao criar o funcionário.");
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
      // Adicione esta verificação de admin
      const isAdmin = await checkAdminStatus();
      if (!isAdmin) {
        throw new Error("Você não tem permissões de administrador para esta operação");
      }
      
      // Força atualização do token antes da operação
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
      }
      
      await deleteSecurityGuard(id);
      // Atualizar a lista após excluir
      const updatedGuards = securityGuards.filter(guard => guard.id !== id);
      setSecurityGuards(updatedGuards);
    } catch (error) {
      console.error('Erro ao excluir segurança:', error);
      alert('Ocorreu um erro ao excluir o funcionário: ' + (error.message || 'Erro desconhecido'));
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

    // Evitar múltiplas chamadas se já estiver carregando
    if (isGeneratingReport) return;
    
    setIsGeneratingReport(true);
    setError(null);

    try {      
      // Criar datas para filtragem
      const startDate = new Date(reportFilter.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(reportFilter.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      // Construir query base - Usando o nome correto da coleção "checkIns"
      let q;
      
      if (reportFilter.securityId) {
        // Consulta por usuário específico
        q = query(collection(db, 'checkIns'), where('userId', '==', reportFilter.securityId));
      } else {
        // Consulta para todos os check-ins
        q = query(collection(db, 'checkIns'));
      }
      
      // Buscar dados
      const snapshot = await getDocs(q);      
      const results = [];
      
      // Processar documentos
      snapshot.forEach(doc => {
        try {
          const data = doc.data();
          
          // Converter timestamp para Date
          let checkInDate;
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            checkInDate = data.timestamp.toDate();
          } else if (data.timestamp && typeof data.timestamp !== 'object') {
            checkInDate = new Date(data.timestamp);
          } else {
            checkInDate = new Date(); // Fallback para data atual
          }
          
          // Filtrar por data
          if (checkInDate >= startDate && checkInDate <= endDate) {
            // Validar e processar URL da imagem
            let photoUrl = data.photoUrl;
            if (photoUrl && typeof photoUrl === 'string') {
              if (!photoUrl.startsWith('http')) {
                photoUrl = null; // Ignorar URLs inválidas
              }
            } else {
              photoUrl = null;
            }
            
            // Garantir que a localização existe
            const location = data.location || { 
              latitude: 0, 
              longitude: 0, 
              accuracy: 0 
            };
            
            // Adicionar à lista de resultados
            results.push({
              id: doc.id,
              userId: data.userId || '',
              username: data.username || 'Usuário não identificado',
              timestamp: checkInDate,
              location: location,
              photoUrl: photoUrl,
              address: 'Carregando endereço...',
              deviceInfo: data.deviceInfo || 'Dispositivo não informado'
            });
          }
        } catch (itemError) {
          console.error("Erro ao processar check-in:", itemError);
          // Continuar com o próximo item
        }
      });
      
      // Ordenar por data (mais recente primeiro)
      results.sort((a, b) => b.timestamp - a.timestamp);      
      // Atualizar estado
      setReportData(results);
      
      // Buscar endereços para cada check-in
      results.forEach(async (item, index) => {
        try {
          if (item.location && item.location.latitude && item.location.longitude) {
            const address = await getAddressFromCoordinates(
              item.location.latitude,
              item.location.longitude
            );
            
            // Atualizar apenas o item específico com o endereço
            setReportData(current => {
              const updated = [...current];
              updated[index] = {...updated[index], address};
              return updated;
            });
          }
        } catch (addrError) {
          console.error("Erro ao buscar endereço:", addrError);
        }
      });
      
      if (results.length === 0) {
        alert('Nenhum registro encontrado para os filtros selecionados.');
      }
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      setError(`Erro ao gerar o relatório: ${error.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Função para obter endereço a partir de coordenadas
  const getAddressFromCoordinates = async (latitude, longitude) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'SecurityMonitoringSystem/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.display_name) {
        return data.display_name;
      } else {
        return `Coordenadas: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }
    } catch (error) {
      console.error('Erro ao obter endereço:', error);
      return `Coordenadas: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };

  // Função para exportar relatório como CSV
  const handleExportCSV = () => {
    if (reportData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }
    
    // Criar cabeçalho CSV mais completo
    const headers = [
      'ID', 
      'Nome do Funcionário', 
      'Data', 
      'Hora', 
      'Latitude', 
      'Longitude', 
      'Endereço',
      'Dispositivo',
      'URL da Foto'
    ];
    
    const csvContent = [
      headers.join(','),
      ...reportData.map(item => {
        const date = new Date(item.timestamp);
        
        return [
          item.id,
          (item.username || 'N/A').replace(/,/g, ' '), // Evitar quebras por vírgulas
          date.toLocaleDateString('pt-BR'),
          date.toLocaleTimeString('pt-BR'),
          item.location.latitude,
          item.location.longitude,
          (item.address || 'Endereço não disponível').replace(/,/g, ' '),
          item.deviceInfo ? `"${item.deviceInfo.replace(/"/g, '""')}"` : 'N/A',
          item.photoUrl || 'N/A'
        ].join(',');
      })
    ].join('\n');
    
    // Criar blob e link de download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    // Nome do arquivo mais informativo
    const fileName = reportFilter.securityId 
      ? `relatorio_${securityGuards.find(g => g.id === reportFilter.securityId)?.username || 'funcionario'}_${reportFilter.startDate}_a_${reportFilter.endDate}.csv`
      : `relatorio_todos_${reportFilter.startDate}_a_${reportFilter.endDate}.csv`;
    
    link.setAttribute('download', fileName);
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
                <dt className="text-sm font-medium text-gray-500 truncate">Total de Funcionários</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.totalGuards}</dd>
              </dl>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Funcionários Operacionais</dt>
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
                    Funcionário
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
                              alt={checkIn.user?.username || 'Funcionário'}
                              onClick={() => setSelectedImage(checkIn.photoUrl)}
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'https://via.placeholder.com/150';
                              }}
                            />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {checkIn.user?.username || 'Funcionário'}
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
                        roleMappings[guard.role]?.bgColor || 'bg-gray-100'} ${roleMappings[guard.role]?.textColor || 'text-gray-800'
                      }`}>
                        {roleMappings[guard.role]?.text || guard.role}
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

  // Usar useMemo para evitar re-renderizações desnecessárias
  const renderedCheckIns = React.useMemo(() => {
    return reportData.map((item) => (
      <div key={item.id} className="bg-gray-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow mb-4">
        <div className="grid grid-cols-4 gap-3">
          {/* Foto do check-in */}
          <div className="md:col-span-1">
            <div className="w-full h-40 bg-gray-200 rounded-lg overflow-hidden">
              {item.photoUrl ? (
                <>
                  {/* Uso de onLoad para verificar carregamento bem-sucedido */}
                  <img 
                    src={item.photoUrl}
                    alt="Check-in" 
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => item.photoUrl && setSelectedImage(item.photoUrl)}
                    onLoad={() => console.log("Imagem carregada com sucesso")}
                    onError={(e) => {
                      // Parar propagação de erros
                      e.target.onerror = null;
                      // Substituir por imagem de fallback
                      e.target.src = 'https://via.placeholder.com/400x300?text=Imagem+indisponível';
                      // Remover cursor pointer quando usar imagem fallback
                      e.target.classList.remove('cursor-pointer');
                      e.target.onclick = null;
                      
                      // Atualizar o estado para não tentar mais abrir esta imagem
                      const updatedData = [...reportData];
                      const itemIndex = updatedData.findIndex(i => i.id === item.id);
                      if (itemIndex >= 0) {
                        updatedData[itemIndex] = {...updatedData[itemIndex], photoUrl: null};
                        setReportData(updatedData);
                      }
                    }}
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                  <span>Sem imagem</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Informações do check-in */}
          <div className="col-span-3">
            <div className="flex justify-between items-start">
              <h3 className="text-base font-medium text-gray-900"> {/* Reduzido text-lg para text-base */}
                {item.username || 'Funcionário não identificado'}
              </h3>
              <span className="text-xs text-gray-500">
                {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : ''}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-gray-500 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">
                    {item.timestamp ? new Date(item.timestamp).toLocaleDateString('pt-BR') : 'Data desconhecida'}
                  </span>
                </p>
                
                <p className="text-sm text-gray-500 flex items-center mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">
                    {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('pt-BR') : 'Hora desconhecida'}
                  </span>
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">
                    {item.address || 'Carregando endereço...'}
                  </span>
                </p>
                
                <div className="mt-2">
                  <a 
                    href={item.location?.latitude ? 
                      `https://www.google.com/maps?q=${item.location.latitude},${item.location.longitude}` : 
                      '#'}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ver no mapa
                  </a>
                </div>
              </div>
            </div>
            
            {item.deviceInfo && (
              <div className="mt-3 text-xs text-gray-500 bg-gray-100 p-2 rounded">
                <span className="font-medium">Dispositivo:</span> {item.deviceInfo}
              </div>
            )}
          </div>
        </div>
      </div>
    ));
  }, [reportData, setSelectedImage]); // Dependências do useMemo
    
  // JSX para a aba de relatórios
  const renderReports = () => {
    return (
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-3 py-3 border-b border-gray-200">
          <h3 className="text-base font-medium text-gray-900">Relatórios</h3>
        </div>
        
        <div className="p-3">
          {/* Filtros em linha para economizar espaço */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex-grow min-w-[120px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Data Inicial</label>
              <input
                type="date"
                name="startDate"
                value={reportFilter.startDate}
                onChange={handleReportFilterChange}
                className="w-full text-xs border-gray-300 rounded-md p-1 border"
              />
            </div>
            <div className="flex-grow min-w-[120px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Data Final</label>
              <input
                type="date"
                name="endDate"
                value={reportFilter.endDate}
                onChange={handleReportFilterChange}
                className="w-full text-xs border-gray-300 rounded-md p-1 border"
              />
            </div>
            <div className="flex-grow min-w-[140px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Funcionário</label>
              <select
                name="securityId"
                value={reportFilter.securityId}
                onChange={handleReportFilterChange}
                className="w-full text-xs border-gray-300 rounded-md p-1 border"
              >
                <option value="">Escolher</option>
                {securityGuards
                  .filter(guard => isOperationalRole(guard.role))
                  .map(guard => (
                    <option key={guard.id} value={guard.id}>
                      {guard.username}
                    </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                className="px-2 py-1 text-xs rounded text-white bg-blue-600 hover:bg-blue-700"
              >
                {isGeneratingReport ? "..." : "Gerar"}
              </button>
              
              {reportData.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="ml-1 px-2 py-1 text-xs rounded border border-gray-300 bg-white"
                >
                  CSV
                </button>
              )}
            </div>
          </div>

          {/* Exibir erro se houver */}
          {error && (
            <div className="mb-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Resultados em formato compacto */}
          {reportData.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-2 text-xs border-t border-gray-200 pt-2">
                <span className="font-medium text-gray-700">Resultados ({reportData.length})</span>
              </div>
              
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {reportData.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded p-2 flex items-center gap-2 text-xs">
                    {/* Miniatura */}
                    <div className="flex-shrink-0 w-12 h-12 bg-gray-200 rounded overflow-hidden">
                      {item.photoUrl ? (
                        <img 
                          src={item.photoUrl}
                          alt=""
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => item.photoUrl && setSelectedImage(item.photoUrl)}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://via.placeholder.com/100?text=N/A';
                            e.target.classList.remove('cursor-pointer');
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-[10px] text-gray-400">
                          N/A
                        </div>
                      )}
                    </div>
                    
                    {/* Info principal */}
                    <div className="flex-grow min-w-0">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold truncate">{item.username || 'Não identificado'}</span>
                        <span className="text-[10px] text-gray-500 ml-1 whitespace-nowrap">
                          {item.timestamp ? new Date(item.timestamp).toLocaleDateString('pt-BR') : '??/??/????'}
                          {' '}
                          {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '??:??'}
                        </span>
                      </div>
                      <div className="truncate text-gray-600">{item.address || 'Localização não disponível'}</div>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex-shrink-0">
                      <a 
                        href={item.location?.latitude ? 
                          `https://www.google.com/maps?q=${item.location.latitude},${item.location.longitude}` : 
                          '#'}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-[10px]"
                        title="Ver no mapa"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            !isGeneratingReport && (
              <div className="text-center py-3 text-xs text-gray-500">
                Selecione os filtros e clique em "Gerar" para ver os resultados.
              </div>
            )
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
                          <option value="vigia">Vigia</option>
                          <option value="porteiro">Porteiro</option>
                          <option value="zelador">Zelador</option>
                          <option value="rh">RH</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="sdf">SDF</option>
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

      {/* Modal para entrada de senha do admin */}
    {showPasswordModal && (
      <div className="fixed z-20 inset-0 overflow-y-auto">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity" aria-hidden="true">
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>

          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Confirmação de senha
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                Para criar um novo usuário, precisamos de sua senha de administrador para manter sua sessão:
              </p>
              <input
                type="password"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Senha de administrador"
              />
            </div>
            
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={handlePasswordConfirm}
                disabled={isSubmitting || !adminPasswordInput}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
                {isSubmitting ? 'Processando...' : 'Confirmar'}
              </button>
              <button
                type="button"
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={() => {
                  setShowPasswordModal(false);
                  setAdminPasswordInput('');
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default AdminDashboard;
