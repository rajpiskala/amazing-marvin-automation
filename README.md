# Amazing Marvin Automation

Amazing Marvin Automation is designed to streamline and automate specific workflows within the [Amazing Marvin](https://amazingmarvin.com/) productivity app. This project includes a wide range of features from creating tasks based on recorded habits to auto-scheduling tasks based on weather conditions. This tool is ideal for users looking to enhance their productivity and task management efficiency within Amazing Marvin.

## Get Started & Initial Setup

### Prerequisites
Verify that these programs are on your computer before proceeding. Otherwise, use these links to download them:
* [NodeJS v20 or higher](https://nodejs.org/en/download/)
* [Git (Version Control)](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
* A server to host and run this program, ex. [DigitalOcean droplet](https://www.digitalocean.com/), [Heroku Dyno](https://www.heroku.com/), [AWS EC2 instance](https://aws.amazon.com/ec2/instance-types/),

**Note:** This application is currently meant to be self-hosted on a server. However, I do have plans to migrating this to be a browser extension as well as figuring out ways to have users be able to use this without having to self-host this.

### Installation
(1) Open a new terminal and first clone this respository from GitHub onto your server:
```bash
# Go to the location you want to install to:
# cd location/to/install/to
# Clone the project (downloads source code into folder)
git clone https://github.com/RogueArt/amazing-marvin-automation
# Go inside the project folder
cd amazing-marvin-automation
```

(2) Install the required packages to run this project
```bash
# Note: make sure Node is installed, otherwise this will not work!
npm install
```

(3) Set up the environment variables
- Rename the file named `.env.template` to `.env`
- Get your API key: go to Amazing Marvin on web/desktop > Strategies (press S) > API (beta) > Settings > View credentials > Copy paste the value under "API token"
- Paste this value onto the empty spot where it says `MARVIN_API_TOKEN`
- Optional: paste the value under "Full access token" into `MARVIN_FULL_ACCESS_TOKEN` if you need direct document reads/updates through Marvin's `/api/doc` endpoints

(4) Set up Amazing Marvin webhooks
- Go to API settings in Amazing Marvin (see instructions in #3)
- Click "Add webhook" and add a webhook for "Record Habit" for "POST"
- For the webhook address, set this to `https://<your-server-domain-name>:<port>/habit-as-task` and save

### Executing program

To run the program, open a terminal and do:
```bash
npm run start
```
The program will run on port 8080 as specified under `constants.js`

## Issues & Help

If you run into any issues, need help, or have any feature suggestions for this project, feel free to create an issue under the "Issue" tab for this project.

**Important Note:** I am not affiliated with the Amazing Marvin team. For any questions or inquiries about the product, please reach out to the Amazing Marvin team at contact@amazingmarvin.com directly.

## Project Features & Status

<details>
  <summary>🚧 Simple spaced repetition / follow-ups (In progress)</summary>

  - Finishing a task with certain keywords triggers follow-up tasks.
  - These tasks are scheduled at intervals of 1d, 3d, 7d, 14d, and 28d from the completion of the original task.
</details>

<details>
  <summary>✅ Creating a completed task after recording habit (Completed)</summary>

  - Allows users to customize the task created after recording a habit.
  - Example: Recording the habit "Brush teeth in the morning" creates a task "Brush teeth #Self-Care ~10m +Today".
  - To stop a specific habit from creating completed tasks, add `$skipHabitTaskCreation` anywhere in that habit's note in Marvin.
  - This is useful when a habit has a category for Marvin organization, but should not generate a task when recorded.
</details>

<details>
  <summary>❌ Auto-schedule from “Today” list (Not started)</summary>

  - Automatically slots tasks from the "Today" list into the calendar based on the current time.
  - Includes an option for adding break periods and working around existing time blocks.
</details>

<details>
  <summary>❌ Burnout Management (Not started)</summary>

  - Analyzes completed tasks' time estimates and automatically schedules break tasks based on workload.
  - Follows a general Pomodoro/Flowmodoro ratio for break scheduling.
</details>

<details>
  <summary>❌ Weather-Based or Holiday-Based tasks (Not started)</summary>

  - Auto-schedules tasks based on the current weather or upcoming holidays.
  - Example: Scheduling "clean gutters" if it's going to rain.
</details>

<!-- Continue adding other sections as needed, following the same format -->
