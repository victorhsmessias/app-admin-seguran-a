import React, { useState, useEffect, useRef } from 'react';
import { getAvatarUrl, getThumbnailUrl, getModalViewUrl } from '../utils/imageUtils';
import { getCurrentUser, logout } from '../services/authService';
import { formatDateForReport, addReportHeader, addEmployeeInfo, addDocumentFooter } from '../utils/pdfUtils';
import { getAllSecurityGuards, createSecurityGuard, updateSecurityGuard, deleteSecurityGuard, blockEmployee, unblockEmployee } from '../services/securityService';
import { getRealtimeCheckIns, getCheckInsByDateRange, getCheckInStats } from '../services/checkInService';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { getDoc, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { roleMappings } from '../utils/roleMappings';
import { logo64 } from '../assets/logo64';

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

  //Função para forçar sincronização com o servidor
  const forceSyncWithServer = async () => {
    try {
      setLoading(true);
      
      // Cancelar listeners existentes
      if (guardsListenerRef.current) {
        guardsListenerRef.current();
      }
      
      // Recriar listener
      const guardsResult = await getAllSecurityGuards();
      setSecurityGuards(guardsResult.data);
      guardsListenerRef.current = guardsResult.unsubscribe;
      
    } catch (error) {
      console.error('Erro na sincronização:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função auxiliar para recarregar dados de um funcionário específico
  const reloadEmployeeData = async (employeeId) => {
    try {
      const employeeDoc = await getDoc(doc(db, 'users', employeeId), { source: 'server' }); // Forçar busca no servidor
      if (employeeDoc.exists()) {
        const updatedEmployee = { id: employeeDoc.id, ...employeeDoc.data() };
        
        // Atualizar o estado local
        setSecurityGuards(prev => 
          prev.map(guard => 
            guard.id === employeeId ? updatedEmployee : guard
          )
        );
        
        return updatedEmployee;
      }
    } catch (error) {
      console.error('Erro ao recarregar dados do funcionário:', error);
    }
  };

  // Função para bloquear funcionário
  const handleBlockEmployee = async (employeeId, employeeName) => {
    const reason = prompt(`Por que deseja bloquear ${employeeName}?`, 'Bloqueado pelo administrador');
    
    if (reason === null) return; // Usuário cancelou
    
    if (!window.confirm(`Tem certeza que deseja bloquear ${employeeName}?`)) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await blockEmployee(employeeId, reason);
      
      // Aguardar um pouco para garantir que os dados foram salvos
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // CORREÇÃO: Recarregar dados do funcionário do servidor
      await reloadEmployeeData(employeeId);
      
      alert(`${employeeName} foi bloqueado com sucesso!`);
      
    } catch (error) {
      console.error('Erro ao bloquear funcionário:', error);
      alert('Erro ao bloquear funcionário: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para desbloquear funcionário
  const handleUnblockEmployee = async (employeeId, employeeName) => {
    if (!window.confirm(`Tem certeza que deseja desbloquear ${employeeName}?`)) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await unblockEmployee(employeeId);
      
      // Aguardar um pouco para garantir que os dados foram salvos
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // CORREÇÃO: Recarregar dados do funcionário do servidor
      await reloadEmployeeData(employeeId);
      
      alert(`${employeeName} foi desbloqueado com sucesso!`);
      
    } catch (error) {
      console.error('Erro ao desbloquear funcionário:', error);
      alert('Erro ao desbloquear funcionário: ' + error.message);
      
      // Em caso de erro, tentar recarregar os dados para sincronizar
      await reloadEmployeeData(employeeId);
    } finally {
      setIsSubmitting(false);
    }
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
  const loadDashboardData = async (retryCount = 0) => {
    setLoading(true);
    try {
      // Forçar atualização do token
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
      } else {
        throw new Error("Usuário não autenticado");
      }
      
      // Buscar seguranças
      const guardsResult = await getAllSecurityGuards();
      setSecurityGuards(guardsResult.data);
      guardsListenerRef.current = guardsResult.unsubscribe;
      
      // Buscar check-ins em tempo real - Use o nome correto da coleção
      const checkInsResult = await getRealtimeCheckIns(20);
      setCheckIns(checkInsResult.data);
      checkInsListenerRef.current = checkInsResult.unsubscribe;
      
      // Buscar estatísticas
      const statsData = await getCheckInStats();
      setStats({
        totalGuards: guardsResult.data.length,
        activeGuards: guardsResult.data.filter(guard => isOperationalRole(guard.role)).length,
        checkInsToday: statsData.todayCount
      });

      setLoading(false);
    } catch (error) {
      console.error(`Erro ao carregar dados (tentativa ${retryCount + 1}):`, error);
      
      // Tentar novamente até 3 vezes, com atraso crescente
      if (retryCount < 2) {
        setTimeout(() => {
          loadDashboardData(retryCount + 1);
        }, (retryCount + 1) * 1000);
        return;
      }
      
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
      const startDateParts = reportFilter.startDate.split('-').map(part => parseInt(part, 10));
      const startDate = new Date(startDateParts[0], startDateParts[1] - 1, startDateParts[2], 0, 0, 0);
      
      const endDateParts = reportFilter.endDate.split('-').map(part => parseInt(part, 10));
      const endDate = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2], 23, 59, 59, 999);
            
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
            return; // Pular item sem data válida
          }
          
          // Verificar se está dentro do intervalo de datas (inclusivo)
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
            
            const location = data.location || { 
              latitude: 0, 
              longitude: 0, 
              accuracy: 0 
            };
            
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
      
      results.sort((a, b) => b.timestamp - a.timestamp);

      setReportData(results);
      
      results.forEach(async (item, index) => {
        try {
          if (item.location && item.location.latitude && item.location.longitude) {
            const address = await getAddressFromCoordinates(
              item.location.latitude,
              item.location.longitude
            );
            
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
      const bigDataResponse = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`
      );
      
      if (bigDataResponse.ok) {
        const data = await bigDataResponse.json();        
        if (data) {
          // Construir endereço mais completo
          const addressParts = [];
          
          // Adicionar informações específicas primeiro
          if (data.street) addressParts.push(data.street);
          if (data.streetNumber) addressParts.push(`nº ${data.streetNumber}`);
          if (data.neighbourhood) addressParts.push(data.neighbourhood);
          if (data.district) addressParts.push(data.district);
          if (data.locality) addressParts.push(data.locality);
          if (data.city) addressParts.push(data.city);
          if (data.principalSubdivision) addressParts.push(data.principalSubdivision);
          if (data.countryName) addressParts.push(data.countryName);
          
          // Se encontrou pelo menos alguma informação
          if (addressParts.length > 0) {
            const completeAddress = addressParts.join(', ');
            return completeAddress;
          }
        }
      }
    } catch (error) {
      console.error('Erro BigDataCloud:', error);
    }
  
    try {      
      const positionstackResponse = await fetch(
        `http://api.positionstack.com/v1/reverse?access_key=free&query=${latitude},${longitude}&limit=1&output=json`
      );
      
      if (positionstackResponse.ok) {
        const data = await positionstackResponse.json();        
        if (data && data.data && data.data[0]) {
          const location = data.data[0];
          const parts = [];
          
          if (location.street) parts.push(location.street);
          if (location.number) parts.push(`nº ${location.number}`);
          if (location.neighbourhood) parts.push(location.neighbourhood);
          if (location.locality) parts.push(location.locality);
          if (location.region) parts.push(location.region);
          if (location.country) parts.push(location.country);
          
          if (parts.length > 0) {
            const address = parts.join(', ');
            return address;
          }
        }
      }
    } catch (error) {
      console.error('Erro Positionstack:', error);
    }
  
    try {      
      const proxyUrl = 'https://api.allorigins.win/get?url=';
      const openCageUrl = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=demo-key&language=pt&pretty=1&no_annotations=1`;
      const fullUrl = proxyUrl + encodeURIComponent(openCageUrl);
      
      const proxyResponse = await fetch(fullUrl);
      
      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();
        const data = JSON.parse(proxyData.contents);
        
        if (data && data.results && data.results[0]) {
          const result = data.results[0];
          
          if (result.formatted) {
            return result.formatted;
          }
          
          // Fallback: construir manualmente
          const components = result.components;
          if (components) {
            const parts = [];
            
            if (components.road) parts.push(components.road);
            if (components.house_number) parts.push(`nº ${components.house_number}`);
            if (components.neighbourhood) parts.push(components.neighbourhood);
            if (components.suburb) parts.push(components.suburb);
            if (components.city) parts.push(components.city);
            if (components.state) parts.push(components.state);
            if (components.country) parts.push(components.country);
            
            if (parts.length > 0) {
              const address = parts.join(', ');
              return address;
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro OpenCage:', error);
    }
  
    try {
      const proxyUrl = 'https://api.allorigins.win/get?url=';
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=pt`;
      const fullUrl = proxyUrl + encodeURIComponent(nominatimUrl);
      
      const proxyResponse = await fetch(fullUrl, {
        headers: {
          'User-Agent': 'SecurityMonitoringSystem/1.0'
        }
      });
      
      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();
        const data = JSON.parse(proxyData.contents);        
        if (data && data.display_name) {
          return data.display_name;
        }
      }
    } catch (error) {
      console.error('Erro Nominatim:', error);
    }
  
    console.warn('Todos os serviços falharam, usando coordenadas');
    
    // Determinar quadrante para informação adicional
    const latDir = latitude >= 0 ? 'Norte' : 'Sul';
    const lngDir = longitude >= 0 ? 'Leste' : 'Oeste';
    
    return `Localização: ${Math.abs(latitude).toFixed(4)}°${latDir}, ${Math.abs(longitude).toFixed(4)}°${lngDir}`;
  };
  // Função auxiliar para formatar data do filtro corretamente
  const formatFilterDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      // Trata especificamente strings no formato YYYY-MM-DD (como vêm do input date)
      const parts = dateString.split('-');
      if (parts.length === 3) {
        // Formato brasileiro (DD/MM/YYYY) - independente de fuso horário
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      
      // Fallback para outros formatos
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
      }
      
      return dateString; // Se não conseguir formatar, retorna a string original
    } catch (e) {
      console.error('Erro ao formatar data do filtro:', e);
      return dateString;
    }
  };

  // Função para exportar relatório como PDF
  const handleExportPDF = () => {
    if (reportData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }
    
    setIsGeneratingReport(true);
    
    // Only import the core jsPDF
    import('jspdf').then(jsPDFModule => {
      try {
        const { default: jsPDF } = jsPDFModule;
        
        // Create the document
        const doc = new jsPDF();
        
        // Page constants
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const usableWidth = pageWidth - (margin * 2);
        
        // Simple helper function for date formatting
        const formatDate = (date) => {
          if (!date) return 'N/A';
          try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return 'N/A';
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
          } catch (e) {
            return 'N/A';
          }
        };
        
        // Function to add report header to a page
        const addHeaderToPage = (title, subtitle) => {
          try {
           
            const logoBase64 = logo64;
            
            if (logoBase64) {
              // If logo base64 is provided, use it
              doc.addImage(logoBase64, 'PNG', margin, 15, 20, 20);
            } else {
              // Fallback to colored rectangle
              doc.setFillColor(203, 173, 108); 
              doc.rect(margin, 15, 20, 20, 'F');
            }
          } catch (error) {
            // Fallback if image loading fails
            console.error('Error loading logo:', error);
            doc.setFillColor(203, 173, 108); 
            doc.rect(margin, 15, 20, 20, 'F');
          }
          
          // Title
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(0, 51, 102);
          doc.text(title, margin + 25, 25);
          
          // Subtitle
          doc.setFontSize(12);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(102, 102, 102);
          doc.text(subtitle, margin + 25, 32);
          
          // Separator line
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.line(margin, 40, pageWidth - margin, 40);
          
          return 45; // Return Y position after header
        };
        
        // Function to add employee info - FURTHER REDUCED HEIGHT
        const addEmployeeInfo = (employee, startY) => {
          // Create border and background for employee section
          doc.setDrawColor(220, 220, 220);
          doc.setFillColor(245, 245, 245);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, startY, usableWidth, 20, 3, 3, 'FD'); // Further reduced height from 25 to 20
          
          // Set up for two columns
          const col1 = margin + 5;
          const col2 = margin + (usableWidth / 2);
          
          // ALL INFO ON ONE LINE - more compact
          doc.setFontSize(8); // Smaller font
          doc.setTextColor(0, 0, 0);
          
          // First row with bold labels and normal text values
          doc.setFont('helvetica', 'bold');
          doc.text("Nome:", col1, startY + 7);
          doc.text("Telefone:", col2, startY + 7);
          
          doc.setFont('helvetica', 'normal');
          doc.text(employee.username || 'Não informado', col1 + 15, startY + 7);
          doc.text(employee.phone || 'Não informado', col2 + 20, startY + 7);
          
          // Second row
          doc.setFont('helvetica', 'bold');
          doc.text("Email:", col1, startY + 14);
          doc.text("Função:", col2, startY + 14);
          
          // Role name with mapping
          let roleName = 'Não informado';
          if (employee.role) {
            roleName = roleMappings[employee.role]?.text || employee.role;
          }
          
          doc.setFont('helvetica', 'normal');
          doc.text(employee.email || 'Não informado', col1 + 15, startY + 14);
          doc.text(roleName, col2 + 20, startY + 14);
          
          return startY + 22; // Return Y position after employee section (reduced from 30)
        };
        
        // Function to add table headers - WITH MORE DESCRIPTIVE LABELS
        const addTableHeaders = (startY) => {
          // Define column info with more descriptive headers
          const headers = ['Nome do Funcionário', 'Data do Check-in', 'Hora', 'Endereço de Localização'];
          const colWidths = [40, 30, 30, 85]; // Kept the same widths
          
          // Draw header cells
          let currentX = margin;
          doc.setFillColor(0, 51, 102);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          
          headers.forEach((header, i) => {
            // Header cell background
            doc.rect(currentX, startY, colWidths[i], 8, 'F');
            
            // Header text
            doc.text(header, currentX + (colWidths[i]/2), startY + 5, {
              align: 'center'
            });
            
            currentX += colWidths[i];
          });
          
          return {
            yPos: startY + 8,
            headers,
            colWidths
          };
        };
        
        // Function to add a data row to the table - kept the same
        const addTableRow = (item, rowIndex, startY, colWidths) => {
          // Set row background color (alternating)
          if (rowIndex % 2 === 0) {
            doc.setFillColor(245, 245, 245);
          } else {
            doc.setFillColor(255, 255, 255);
          }
          
          // Row height
          const rowHeight = 7;
          
          // Draw row background
          doc.rect(margin, startY, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
          
          // Format date and time
          let dateStr = 'N/A';
          let timeStr = 'N/A';
          
          try {
            if (item.timestamp) {
              const date = new Date(item.timestamp);
              if (!isNaN(date.getTime())) {
                dateStr = formatDate(date);
                timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
              }
            }
          } catch (e) { 
            // Keep fallback values
          }
          
          // Set text properties
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          
          // Add cell data
          let currentX = margin;
          
          // Username/Funcionário (with bold style)
          doc.setFont('helvetica', 'bold');
          doc.text(item.username || 'Não identificado', currentX + 2, startY + 4.5);
          currentX += colWidths[0];
          
          // Return to normal font weight
          doc.setFont('helvetica', 'normal');
          
          // Date
          doc.text(dateStr, currentX + 2, startY + 4.5);
          currentX += colWidths[1];
          
          // Time
          doc.text(timeStr, currentX + 2, startY + 4.5);
          currentX += colWidths[2];
          
          // Location - truncate if too long
          const address = item.address || 'Endereço não disponível';
          const maxChars = 50;
          const displayAddress = address.length > maxChars ? address.substring(0, maxChars) + '...' : address;
          doc.text(displayAddress, currentX + 2, startY + 4.5);
          
          return startY + rowHeight;
        };
        
        // Function to add footer to all pages - kept the same
        const addFooterToAllPages = () => {
          const pageCount = doc.internal.getNumberOfPages();
          
          for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Add footer line
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
            
            // Add footer text
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            
            // Current date
            const today = new Date();
            const dateText = formatDate(today);
            const timeText = `${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`;
            
            doc.text(`Relatório gerado em: ${dateText} às ${timeText}`, margin, pageHeight - 12);
            
            // Page numbers
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 12, {
              align: 'right'
            });
          }
        };
        let yPos = addHeaderToPage("Sistema de Monitoramento", "Relatório de Check-ins");
        
        // Add period information
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const startDate = formatFilterDate(reportFilter.startDate);
        const endDate = formatFilterDate(reportFilter.endDate);
        doc.text(`Período: ${startDate} a ${endDate}`, margin, yPos);
        yPos += 8; // Reduced from 10
        
        // Add employee info if filtered by employee
        if (reportFilter.securityId) {
          const employee = securityGuards.find(g => g.id === reportFilter.securityId);
          if (employee) {
            yPos = addEmployeeInfo(employee, yPos);
          }
        } else {
          // General report title
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(0, 51, 102);
          doc.text("Relatório Geral - Todos os Funcionários", margin, yPos);
          yPos += 8; // Reduced from 10
        }
        
        // Add table headers
        const tableInfo = addTableHeaders(yPos);
        yPos = tableInfo.yPos;
        
        // Constants for pagination
        const rowHeight = 7;
        const headerHeight = 30; // Space needed for page header
        const footerHeight = 25; // Space needed for page footer
        const availableHeight = pageHeight - headerHeight - footerHeight;
        const maxRowsPerPage = Math.floor(availableHeight / rowHeight);
        
        // Add table rows with pagination
        reportData.forEach((item, index) => {
          // Check if we need a new page
          if (index > 0 && index % maxRowsPerPage === 0) {
            // Add a new page
            doc.addPage();
            
            // Add header to new page
            yPos = addHeaderToPage("Sistema de Monitoramento", "Continuação do Relatório");
            
            // Add new table headers
            const newTableInfo = addTableHeaders(yPos);
            yPos = newTableInfo.yPos;
          }
          
          // Add this row
          yPos = addTableRow(item, index, yPos, tableInfo.colWidths);
        });
        
        // Add total records count
        yPos += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total de registros: ${reportData.length}`, margin, yPos);
        
        // Add footer to all pages
        addFooterToAllPages();
        
        // Generate filename
        let fileName = 'relatorio_check_ins.pdf';
        
        try {
          if (reportFilter.securityId) {
            const guard = securityGuards.find(g => g.id === reportFilter.securityId);
            const guardName = guard?.username?.replace(/[^a-zA-Z0-9]/g, '_') || 'funcionario';
            fileName = `relatorio_${guardName}_${reportFilter.startDate || 'inicio'}_a_${reportFilter.endDate || 'fim'}.pdf`;
          } else {
            fileName = `relatorio_todos_${reportFilter.startDate || 'inicio'}_a_${reportFilter.endDate || 'fim'}.pdf`;
          }
        } catch (e) {
          console.error('Erro ao gerar nome do arquivo:', e);
        }
        
        // Save the document
        doc.save(fileName);
        
      } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Ocorreu um erro ao gerar o PDF: ' + (error.message || 'Erro desconhecido'));
      } finally {
        setIsGeneratingReport(false);
      }
    }).catch(importError => {
      console.error('Erro ao importar jsPDF:', importError);
      alert('Não foi possível carregar a biblioteca PDF. Verifique sua conexão.');
      setIsGeneratingReport(false);
    });
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

    // Calcular estatísticas com base nos dados dos funcionários
    const totalEmployees = securityGuards.length;
    const activeEmployees = securityGuards.filter(guard => 
      guard.status !== 'blocked' && isOperationalRole(guard.role)
    ).length;
    const blockedEmployees = securityGuards.filter(guard => 
      guard.status === 'blocked'
    ).length;

    return (
      <div>
        {/* Cartões de estatísticas atualizados */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total de Funcionários</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{totalEmployees}</dd>
              </dl>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Funcionários Ativos</dt>
                <dd className="mt-1 text-3xl font-semibold text-green-600">{activeEmployees}</dd>
              </dl>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Funcionários Bloqueados</dt>
                <dd className="mt-1 text-3xl font-semibold text-red-600">{blockedEmployees}</dd>
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

        {/* Resto do código da tabela de check-ins permanece igual... */}
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {securityGuards.length > 0 ? (
                securityGuards.map((guard) => {
                  const isBlocked = guard.status === 'blocked';
                  const isOperational = isOperationalRole(guard.role);
                  
                  return (
                    <tr key={guard.id} className={`hover:bg-gray-50 ${isBlocked ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${isBlocked ? 'text-red-900' : 'text-gray-900'}`}>
                              {guard.username}
                            </div>
                            {isBlocked && guard.blockReason && (
                              <div className="text-xs text-red-600 mt-1">
                                Motivo: {guard.blockReason}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${isBlocked ? 'text-red-700' : 'text-gray-900'}`}>
                          {guard.email}
                        </div>
                        <div className={`text-sm ${isBlocked ? 'text-red-500' : 'text-gray-500'}`}>
                          {guard.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          roleMappings[guard.role]?.bgColor || 'bg-gray-100'} ${roleMappings[guard.role]?.textColor || 'text-gray-800'
                        }`}>
                          {roleMappings[guard.role]?.text || guard.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          isBlocked 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {isBlocked ? 'Bloqueado' : 'Ativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          {/* Só mostrar botões de bloquear/desbloquear para funcionários operacionais */}
                          {isOperational && (
                            <>
                              {isBlocked ? (
                                <button
                                  onClick={() => handleUnblockEmployee(guard.id, guard.username)}
                                  className="text-green-600 hover:text-green-900"
                                  disabled={isSubmitting}
                                  title="Desbloquear funcionário"
                                >
                                  Desbloquear
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleBlockEmployee(guard.id, guard.username)}
                                  className="text-orange-600 hover:text-orange-900"
                                  disabled={isSubmitting}
                                  title="Bloquear funcionário"
                                >
                                  Bloquear
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(guard)}
                            className="text-indigo-600 hover:text-indigo-900"
                            disabled={isSubmitting}
                          >
                            Editar
                          </button>                       
                          <button
                            onClick={() => handleDeleteGuard(guard.id)}
                            className="text-red-600 hover:text-red-900"
                            disabled={isSubmitting}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
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
                  onClick={handleExportPDF}
                  className="ml-1 px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                  </svg>
                  PDF
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
        <div className="mb-6 border-b border-gray-200 flex items-center justify-between">
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
          <img 
            src='./images/logo.png'
            alt="DS Security Suprema" 
            className="mr-20 h-24 w-auto"
          />
          
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
                          <option value="admin">Administrador</option>
                          <option value="porteiro">Porteiro</option>
                          <option value="rh">RH</option>
                          <option value="sdf">SDF</option>
                          <option value="security">Segurança</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="vigia">Vigia</option>
                          <option value="zelador">Zelador</option>
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
