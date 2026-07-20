import { motion } from 'framer-motion';
import { ShieldCheck, Anchor, Clock, CheckCircle2, Wrench } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import DashboardBanner from '../components/DashboardBanner';
import ApprovalQueue from '../components/admin/ApprovalQueue';
import { useAsync } from '../hooks/useAsync';
import { photos } from '../data/photos';
import * as boats from '../services/boats.service';

export default function AdminDashboard() {
  const { data } = useAsync(() => boats.listBoatsForAdmin(), []);
  const list = data ?? [];

  const stats = [
    { label: 'Total boats', value: list.length, icon: Anchor },
    { label: 'Awaiting review', value: list.filter((b) => b.status === 'pending' || b.pendingChanges).length, icon: Clock },
    { label: 'Live for tourists', value: list.filter((b) => b.status === 'approved' && b.isActive).length, icon: CheckCircle2 },
    { label: 'Maintenance attention', value: list.filter((b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue').length, icon: Wrench },
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <DashboardBanner
          image={photos.wildlife1}
          eyebrow="Admin panel"
          title="Platform oversight"
          icon={ShieldCheck}
        />

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-lake-100 bg-white p-4 shadow-sm"
            >
              <stat.icon size={18} className="text-lake-600" />
              <p className="mt-2 text-2xl font-bold tabular-nums text-lake-950">{stat.value}</p>
              <p className="text-xs text-lake-500">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8">
          <ApprovalQueue />
        </div>
      </div>
    </PageTransition>
  );
}
