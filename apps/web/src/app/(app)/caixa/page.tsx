import { redirect } from 'next/navigation'

// Caixa e PDV viraram a mesma tela. Link antigo (e QR ja impresso apontando
// pra ca) continua funcionando.
export default function CaixaPage() {
  redirect('/pdv')
}
