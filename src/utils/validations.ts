/**
 * Brazilian CPF Validator implementing the official modulo 11 algorithm
 */
export function validateCPF(rawCpf: string): boolean {
  const cpf = rawCpf.replace(/\D/g, '');

  if (cpf.length !== 11) return false;

  // Disallow known blacklisted invalid CPFs (all identical digits)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Calculate 1st verification digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rest = (sum * 10) % 11;
  let firstDigit = rest === 10 || rest === 11 ? 0 : rest;

  if (firstDigit !== parseInt(cpf.charAt(9), 10)) return false;

  // Calculate 2nd verification digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rest = (sum * 10) % 11;
  let secondDigit = rest === 10 || rest === 11 ? 0 : rest;

  return secondDigit === parseInt(cpf.charAt(10), 10);
}

/**
 * Format string as CPF: 000.000.000-00
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/**
 * Mask CPF for display: ***.456.789-**
 */
export function maskCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/**
 * Format string as Brazilian Phone: (XX) XXXXX-XXXX
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Calculate age and verify if at least 16 years old
 */
export function calculateAge(birthDateString: string): { age: number; isEligible: boolean } {
  if (!birthDateString) return { age: 0, isEligible: false };

  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return { age: 0, isEligible: false };

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return {
    age,
    isEligible: age >= 16 && age <= 75,
  };
}

/**
 * Format currency in Brazilian Real (R$)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

/**
 * Generates a random alphanumeric receipt code
 */
export function generateReceiptCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PGK-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
