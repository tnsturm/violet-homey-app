Bring your PoolDigital Violet or BADU Blue pool controller into Homey over the local network. See live water chemistry and temperatures, pump and equipment state, and dosing, and control the filter pump, light and PV-surplus mode.

An optional Langelier (LSI) water-balance safety net warns you before the water turns corrosive or scaling. All readings feed Homey Insights and Flow.

Alarm notifications (NOTIFY): the app can receive the Violet's alarm pushes and fire the "An alarm was received" Flow trigger. In the Violet's notification settings, set Homey's IP and the "Alarm listener port" from the device settings as receiver (any path, plain HTTP GET). Note: the Violet supports neither HTTPS nor authentication for NOTIFY, so any device on your LAN could send such a request — the trigger is display/automation data only and can never control the pool. Keep the port LAN-only; never port-forward it.
