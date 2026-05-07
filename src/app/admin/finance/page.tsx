import { requireRole } from '@/lib/auth';
import { listExchangeOptions, listBankLoanOptions } from '@/app/actions/admin';
import FinanceClient from './FinanceClient';

export default async function FinancePage() {
  await requireRole('admin');
  const [ex, loan] = await Promise.all([listExchangeOptions(), listBankLoanOptions()]);
  return (
    <FinanceClient
      initialExchange={ex.ok ? ex.data! : []}
      initialLoan={loan.ok ? loan.data! : []}
    />
  );
}
