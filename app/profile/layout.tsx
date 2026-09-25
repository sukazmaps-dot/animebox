import '../patch16-5-profile-widgets.css';
import '../patch18-4-6-profile-widgets-cascade.css';
import '../premium.css';
import type { Metadata } from 'next';
import '../premium-studio-v12.css';
import '../profile-editor-v13.css';
import '../patch16-6-5-profile-studio.css';
import '../patch17-4-2-2-public-profile-grid.css';
import '../premium-profile-v14.css';

import '../community.css';
import '../sponsor-v2.css';
import '../monetization-v3.css';
import '../donatepay-claim.css';
export const metadata: Metadata = {
  title: 'Профиль',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
