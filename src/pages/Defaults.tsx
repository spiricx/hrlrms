import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IndividualDefaultsTab from '@/components/defaults/IndividualDefaultsTab';
import BatchDefaultsTab from '@/components/defaults/BatchDefaultsTab';

export default function Defaults() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Loan Defaults</h1>
        <p className="text-muted-foreground text-sm mt-1">View individual and batch loan accounts currently in default.</p>
      </div>

      <Tabs defaultValue="individual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="individual">Individual Defaults</TabsTrigger>
          <TabsTrigger value="batch">Batch Defaults</TabsTrigger>
        </TabsList>

        <TabsContent value="individual">
          <IndividualDefaultsTab />
        </TabsContent>

        <TabsContent value="batch">
          <BatchDefaultsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
