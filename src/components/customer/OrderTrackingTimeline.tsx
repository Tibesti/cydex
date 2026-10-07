import React from 'react';

interface TrackingStep {
  id: number;
  title: string;
  completed: boolean;
  time: string | null;
  description?: string;
}

interface OrderTrackingTimelineProps {
  steps: TrackingStep[];
  eta?: string;
  status: string;
}

const OrderTrackingTimeline = ({ 
  steps, 
  eta, 
  status
}: OrderTrackingTimelineProps) => {
  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg p-3 sm:p-4 bg-muted">
        <h3 className="font-medium mb-3 sm:mb-4 text-sm sm:text-base">Order Tracking</h3>
        <div className="relative">
          <div className="absolute left-3 sm:left-4 top-0 bottom-0 w-0.5 sm:w-1 bg-border"></div>
          {steps.map((step, index) => (
            <div key={step.id} className="flex mb-4 sm:mb-6 relative">
              <div className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center z-10 flex-shrink-0 ${
                step.completed ? 'bg-green-500 text-white' : 'bg-background border border-border'
              }`}>
                {step.completed ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="text-xs sm:text-sm">{index + 1}</span>
                )}
              </div>
              <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                <p className="font-medium text-sm sm:text-base">{step.title}</p>
                {step.time && <p className="text-xs sm:text-sm text-muted-foreground">{step.time}</p>}
                {step.description && <p className="text-xs sm:text-sm text-muted-foreground mt-1">{step.description}</p>}
              </div>
            </div>
          ))}
        </div>
        
        {(status === 'out_for_delivery' || status === 'ready_for_pickup') && eta && (
          <div className="mt-3 sm:mt-4">
            <p className="text-xs sm:text-sm text-muted-foreground mb-2">Estimated Time of Arrival</p>
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-primary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span className="font-medium text-sm sm:text-base">{eta}</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default OrderTrackingTimeline;
