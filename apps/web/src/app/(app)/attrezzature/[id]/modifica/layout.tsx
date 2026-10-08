import { FormWidth } from "@/components/shell";

/** Un modulo: 960 px al massimo, come tutti i moduli dell'app. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FormWidth>{children}</FormWidth>;
}
