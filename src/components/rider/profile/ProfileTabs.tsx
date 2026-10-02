import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import PersonalInfoTab, { type PersonalDraft } from './tabs/PersonalInfoTab';
import BankingTab from './tabs/BankingTab';
import ReviewsTab from './tabs/ReviewsTab';
import AchievementsTab from './tabs/AchievementsTab';
import SecuritySettings from './SecuritySettings';

interface ProfileTabsProps {
  editing: boolean;
  profile: any;
  recentReviews: any[];
  achievements: any[];
  onAddBankDetails?: (bankDetails: any) => Promise<boolean>;
  onSaveProfile?: (updatedData?: any) => Promise<void>;
  /** Receives the Personal tab's current (unsaved) values, for the header Save button */
  onPersonalDraftChange?: (draft: PersonalDraft) => void;
}

const ProfileTabs = ({ 
  editing, 
  profile, 
  recentReviews, 
  achievements, 
  onAddBankDetails,
  onSaveProfile,
  onPersonalDraftChange
}: ProfileTabsProps) => {
  return (
    <Tabs defaultValue="personal" className="w-full">
      <div className="mb-3 sm:mb-4 md:mb-6">
        <ScrollArea className="w-full">
          <TabsList className="flex w-max min-w-full h-10">
            <TabsTrigger value="personal" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Personal</TabsTrigger>
            <TabsTrigger value="bank" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Banking</TabsTrigger>
            <TabsTrigger value="security" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Security</TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Reviews</TabsTrigger>
            <TabsTrigger value="achievements" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Achievements</TabsTrigger>
          </TabsList>
        </ScrollArea>
      </div>
      
      <TabsContent value="personal" className="mt-0">
        <PersonalInfoTab 
          editing={editing} 
          profile={profile} 
          onSaveProfile={onSaveProfile}
          onDraftChange={onPersonalDraftChange}
        />
      </TabsContent>
      
      <TabsContent value="bank" className="mt-0">
        <BankingTab editing={editing} profile={profile} onAddBankDetails={onAddBankDetails} />
      </TabsContent>
      
      <TabsContent value="security" className="mt-0">
        <SecuritySettings />
      </TabsContent>
      
      <TabsContent value="reviews" className="mt-0">
        <ReviewsTab profile={profile} recentReviews={recentReviews} />
      </TabsContent>
      
      <TabsContent value="achievements" className="mt-0">
        <AchievementsTab profile={profile} achievements={achievements} />
      </TabsContent>
    </Tabs>
  );
};

export default ProfileTabs;
