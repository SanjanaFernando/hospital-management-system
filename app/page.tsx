import { getWardsWithPatients } from "@/app/actions/wardActions";
import DashboardClient from "@/app/components/DashboardClient";

export default async function Home() {
  // Server component: fetch data server-side
  const wards = await getWardsWithPatients();
  return <DashboardClient initialWards={wards} />;
}
