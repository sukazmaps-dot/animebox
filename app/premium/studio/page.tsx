import { redirect } from 'next/navigation';

export default function PremiumStudioPage() {
  redirect('/profile/edit?tab=style');
}
