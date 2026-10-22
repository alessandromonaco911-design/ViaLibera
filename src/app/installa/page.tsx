import type { Metadata } from "next";
import { InstallGuide } from "@/components/install/app-access";

export const metadata: Metadata = { title: "Aggiungi alla Home" };

export default function InstallPage() { return <InstallGuide />; }
