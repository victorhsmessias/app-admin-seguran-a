import { roleMappings } from './roleMappings';
/**
 * Formata data para o relatório no padrão brasileiro
 * @param {Date|string|number} date - Data a ser formatada
 * @param {boolean} includeTime - Se deve incluir o horário
 * @returns {string} Data formatada
 */
export const formatDateForReport = (date, includeTime = false) => {
    if (!date) return 'Data inválida';
    
    let dateObj;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else if (date && date.seconds) {
      // Firestore Timestamp
      dateObj = new Date(date.seconds * 1000);
    } else {
      return 'Data inválida';
    }
    
    // Verificar se é uma data válida
    if (isNaN(dateObj.getTime())) {
      return 'Data inválida';
    }
    
    const options = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return new Intl.DateTimeFormat('pt-BR', options).format(dateObj);
  };
  
  /**
   * Cria um cabeçalho de relatório com logo
   * @param {object} doc - Instância do jsPDF
   * @param {string} title - Título do relatório
   * @param {string} subtitle - Subtítulo opcional
   */
  export const addReportHeader = (doc, title, subtitle = '') => {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    const logoUrl = 'public/images/logo.png'; // Caminho do logo no servidor
    try {
      doc.addImage(logoUrl, 'PNG', 15, 15, 20, 20);
    } catch (error) {
      doc.setFillColor(203, 173, 108); 
      doc.rect(15, 15, 20, 20, 'F');
    }
    
    // Adicionar título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.text(title, 40, 25);
    
    // Adicionar subtítulo, se fornecido
    if (subtitle) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(102, 102, 102);
      doc.text(subtitle, 40, 32);
    }
    
    // Adicionar linha separadora
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, 40, pageWidth - 15, 40);
  };
  
  /**
   * Adiciona dados do funcionário no relatório
   * @param {object} doc - Instância do jsPDF
   * @param {object} employee - Dados do funcionário
   * @param {number} yPosition - Posição Y inicial
   * @param {object} roleMappings - Objeto de mapeamento de funções (opcional)
   * @returns {number} Nova posição Y após adicionar os dados
   */
  export const addEmployeeInfo = (doc, employee, yPosition, roleMappings = null) => {
    // Criar borda para seção de funcionário
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(245, 245, 245);
    doc.setLineWidth(0.3);
    
    // Borda com preenchimento
    doc.roundedRect(15, yPosition - 5, pageWidth - 30, 40, 3, 3, 'FD');
    
    // Título da seção
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 51, 102);
    doc.text("Dados do Funcionário", 20, yPosition);
    
    // Informações do funcionário
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    const y = yPosition + 10;
    
    // Grid de 2 colunas
    const col1 = 20;
    const col2 = pageWidth / 2;
    
    doc.text(`Nome: ${employee.username || 'Não informado'}`, col1, y);
    doc.text(`Telefone: ${employee.phone || 'Não informado'}`, col2, y);
    
    doc.text(`Email: ${employee.email || 'Não informado'}`, col1, y + 8);
    
    // Tratamento seguro para o nome da função
    let roleName = 'Não informado';
    if (employee.role) {
      if (roleMappings && roleMappings[employee.role]?.text) {
        roleName = roleMappings[employee.role].text;
      } else {
        roleName = employee.role;
      }
    }
    
    doc.text(`Função: ${roleName}`, col2, y + 8);
    
    // Adicionar um espaço após os dados do funcionário
    return yPosition + 45;
  };
  
  /**
   * Adiciona rodapé em todas as páginas do documento
   * @param {object} doc - Instância do jsPDF
   */
  export const addDocumentFooter = (doc) => {
    const pageCount = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Linha separadora
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(15, pageHeight - 20, pageWidth - 15, pageHeight - 20);
      
      // Texto do rodapé
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      
      // Data de geração
      const today = new Date();
      const dateText = formatDateForReport(today, true);
      doc.text(`Relatório gerado em: ${dateText}`, 15, pageHeight - 10);
      
      // Numeração de página
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
    }
  };