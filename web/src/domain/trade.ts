export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
export type Direction = 'BUY' | 'SELL';

export type Trade = {
  id: string;

  user_id?: string; 
  account_id: string | null;
  template_id: string | null;

  opened_at: string; 

  instrument: string | null;
  direction: Direction | null;
  outcome: Outcome | null;

  pnl_amount: number | null; 
  pnl_percent: number | null; 
  commission: number | null;

  net_pnl: number | null; 
  reviewed_at: string | null;

  risk_amount: number | null;
  r_multiple: number | null;
};

export type TradeNetLite = Pick<
  Trade,
  'pnl_amount' | 'pnl_percent' | 'commission' | 'net_pnl' | 'reviewed_at'
>;

export type TradeDisplay = {
  id: string;
  account_id: string;
  template_id: string | null;
  opened_at: string;

  instrument: string;
  direction: Direction;
  outcome: Outcome;

  pnl_amount: number;
  pnl_percent: number;

  commission: number | null;
  net_pnl: number | null;
  reviewed_at: string | null;

  risk_amount: number | null;
  r_multiple: number | null;
};