import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { PanelHeading } from "@/components/workspace";
import { Link } from "@/lib/navigation";
import { ArrowUpRight, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const role = user?.role === "admin" ? "Administrator" : "Staf toko";
  return <div className="workspace-page">
    <PageHeader title="Profil saya" description="Identitas dan akses akun yang Anda gunakan di Alfan Media." actions={<Link href="/settings" className="workspace-button">Pengaturan <ArrowUpRight size={16} /></Link>} />
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <section className="workspace-panel">
        <div className="h-24 border-b border-border bg-primary/10" />
        <div className="px-6 pb-6"><div className="relative -mt-9 flex size-20 items-center justify-center rounded-2xl border-4 border-card bg-primary font-serif text-4xl text-primary-foreground">{user?.name?.charAt(0).toUpperCase() ?? "A"}</div><h2 className="mt-4 break-words font-serif text-2xl">{user?.name}</h2><p className="mt-1 text-sm text-muted-foreground">{role}</p><p className="mt-5 break-all text-xs text-muted-foreground">{user?.email}</p><button onClick={() => void logout()} className="workspace-button mt-6 w-full"><LogOut size={16} />Keluar dari akun</button></div>
      </section>
      <div className="space-y-5">
        <section className="workspace-panel"><PanelHeading title="Informasi akun" description="Data akun yang terdaftar di toko." /><dl className="divide-y divide-border px-6">
          {[{label:"Nama lengkap",value:user?.name,icon:UserRound},{label:"Alamat email",value:user?.email,icon:Mail},{label:"Peran akun",value:role,icon:ShieldCheck}].map(item=><div key={item.label} className="flex items-start gap-4 py-5"><item.icon size={18} className="mt-0.5 shrink-0 text-muted-foreground" /><div className="min-w-0"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1.5 break-words text-sm font-medium">{item.value}</dd></div></div>)}
        </dl></section>
        <section className="border-l-2 border-primary px-5 py-1"><h2 className="text-sm font-semibold">Akses {role.toLowerCase()}</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{user?.role === "admin" ? "Anda dapat mengelola operasional toko serta mengatur provider dan model asisten AI." : "Anda dapat menjalankan operasional toko. Pengaturan provider dan model AI dikelola administrator."}</p></section>
      </div>
    </div>
  </div>;
}
