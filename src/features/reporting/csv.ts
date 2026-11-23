export function exportCSV(filename: string, data: any[], headers: string[]) {
  if (data.length === 0) {
    alert('لا توجد بيانات للتصدير');
    return;
  }
  
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        let value = row[header];
        if (value === null || value === undefined) value = '';
        value = String(value);
        // Escape quotes and wrap if contains comma, newline, or quote
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      }).join(',')
    )
  ].join('\r\n');
  
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
